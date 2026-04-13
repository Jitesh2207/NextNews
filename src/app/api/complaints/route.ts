import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const MIN_FORM_FILL_MS = 2500;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 6;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_REGEX = /^[0-9+()\-\s]{7,20}$/;
const ALLOWED_SUBJECTS = new Set([
    "Technical Issue",
    "Payment Issue",
    "Account Issue",
    "Registration Related Issue",
    "Notes Issue",
]);

type ComplaintPayload = {
    name: string;
    email: string;
    subject: string;
    contactNumber: string;
    website?: string;
    formStartedAt?: number;
};

type RateLimitEntry = {
    count: number;
    windowStart: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIdentifier(req: Request) {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const userAgent = (req.headers.get("user-agent") || "unknown").slice(0, 120);

    const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";
    return `${ip}:${userAgent}`;
}

function isRateLimited(identifier: string) {
    const now = Date.now();

    if (rateLimitStore.size > 1000) {
        for (const [key, entry] of rateLimitStore.entries()) {
            if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
                rateLimitStore.delete(key);
            }
        }
    }

    const entry = rateLimitStore.get(identifier);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.set(identifier, { count: 1, windowStart: now });
        return false;
    }

    entry.count += 1;
    rateLimitStore.set(identifier, entry);
    return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function validatePayload(payload: unknown) {
    if (!payload || typeof payload !== "object") {
        return { ok: false as const, error: "Invalid request payload" };
    }

    const data = payload as Partial<ComplaintPayload>;
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const subject = typeof data.subject === "string" ? data.subject.trim() : "";
    const contactNumber =
        typeof data.contactNumber === "string" ? data.contactNumber.trim() : "";
    const website = typeof data.website === "string" ? data.website.trim() : "";
    const formStartedAt =
        typeof data.formStartedAt === "number" ? data.formStartedAt : undefined;

    if (name.length < 2 || name.length > 80) {
        return { ok: false as const, error: "Name must be between 2 and 80 characters" };
    }

    if (!EMAIL_REGEX.test(email) || email.length > 120) {
        return { ok: false as const, error: "Please provide a valid email address" };
    }

    if (!ALLOWED_SUBJECTS.has(subject)) {
        return { ok: false as const, error: "Please select a valid issue type" };
    }

    if (contactNumber && !CONTACT_REGEX.test(contactNumber)) {
        return { ok: false as const, error: "Please provide a valid contact number" };
    }

    return {
        ok: true as const,
        data: {
            name,
            email,
            subject,
            contactNumber,
            website,
            formStartedAt,
        },
    };
}

function getSheetsClient() {
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!clientEmail || !privateKey) {
        throw new Error("Missing Google Sheets credentials");
    }

    const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: SCOPES,
    });

    return google.sheets({ version: "v4", auth });
}

export async function POST(req: Request) {
    try {
        const parsed = validatePayload(await req.json());

        if (!parsed.ok) {
            return NextResponse.json({ error: parsed.error }, { status: 400 });
        }

        const { name, email, subject, contactNumber, website, formStartedAt } = parsed.data;

        if (website) {
            return NextResponse.json({ ok: true });
        }

        if (formStartedAt && Date.now() - formStartedAt < MIN_FORM_FILL_MS) {
            return NextResponse.json(
                { error: "Submission too fast. Please try again." },
                { status: 429 },
            );
        }

        const clientIdentifier = getClientIdentifier(req);

        if (isRateLimited(clientIdentifier)) {
            return NextResponse.json(
                { error: "Too many submissions. Please try again later." },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.floor(RATE_LIMIT_WINDOW_MS / 1000)) },
                },
            );
        }

        const sheets = getSheetsClient();

        const spreadsheetId = process.env.GOOGLE_SHEETS_SHEET_ID;
        const preferredSheetName = (process.env.GOOGLE_SHEETS_SHEET_NAME || "").trim();

        if (!spreadsheetId) {
            throw new Error("Missing sheet ID");
        }

        const metadata = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: "sheets.properties.title",
        });

        const sheetTitles =
            metadata.data.sheets
                ?.map((sheet) => sheet.properties?.title)
                .filter((title): title is string => Boolean(title)) ?? [];

        if (sheetTitles.length === 0) {
            throw new Error("No sheets found in the spreadsheet");
        }

        const resolvedSheetName =
            preferredSheetName && sheetTitles.includes(preferredSheetName)
                ? preferredSheetName
                : sheetTitles[0];

        if (preferredSheetName && preferredSheetName !== resolvedSheetName) {
            console.warn(
                `Sheet '${preferredSheetName}' not found. Using '${resolvedSheetName}' instead.`,
            );
        }

        const escapedSheetName = resolvedSheetName.replace(/'/g, "''");
        const sheetRange = `'${escapedSheetName}'!A1`;

        const now = new Date().toISOString();

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: sheetRange,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [
                    [
                        now,
                        name ?? "",
                        email ?? "",
                        subject ?? "",
                        contactNumber ?? "",
                    ],
                ],
            },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Failed to save complaint:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to save complaint" },
            { status: 500 },
        );
    }
}