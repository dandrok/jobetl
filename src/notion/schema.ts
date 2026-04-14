export interface NotionDatabaseShape {
  properties: Record<string, { type: string }>;
}

export interface NotionJobDatabaseSchema {
  statusKind: "status" | "select";
  sourceKind?: "select" | "rich_text";
  companyKind?: "rich_text";
  salaryKind?: "rich_text";
  locationKind?: "rich_text";
  matchScoreKind?: "number";
  matchReasonKind?: "rich_text";
  summaryKind?: "rich_text";
  createdAtKind?: "date" | "rich_text";
  updatedAtKind?: "date" | "rich_text";
}

function requirePropertyType(
  database: NotionDatabaseShape,
  name: string,
  supportedTypes: string[]
): string {
  const property = database.properties[name];

  if (!property) {
    throw new Error(`Missing required Notion property: "${name}"`);
  }

  if (!supportedTypes.includes(property.type)) {
    throw new Error(
      `Notion property "${name}" must use one of: ${supportedTypes.join(", ")}`
    );
  }

  return property.type;
}

function readOptionalPropertyType(
  database: NotionDatabaseShape,
  name: string,
  supportedTypes: string[]
): string | undefined {
  const property = database.properties[name];

  if (!property) {
    return undefined;
  }

  if (!supportedTypes.includes(property.type)) {
    throw new Error(
      `Optional Notion property "${name}" must use one of: ${supportedTypes.join(", ")}`
    );
  }

  return property.type;
}

export function buildNotionJobDatabaseSchema(
  database: NotionDatabaseShape
): NotionJobDatabaseSchema {
  requirePropertyType(database, "Name", ["title"]);
  requirePropertyType(database, "External ID", ["rich_text"]);
  requirePropertyType(database, "URL", ["url"]);

  const statusKind = requirePropertyType(database, "Status", ["status", "select"]);
  const sourceKind = readOptionalPropertyType(database, "Source", [
    "select",
    "rich_text"
  ]);
  const companyKind = readOptionalPropertyType(database, "Company", ["rich_text"]);
  const salaryKind = readOptionalPropertyType(database, "Salary", ["rich_text"]);
  const locationKind = readOptionalPropertyType(database, "Location", ["rich_text"]);
  const matchScoreKind = readOptionalPropertyType(database, "Match Score", ["number"]);
  const matchReasonKind = readOptionalPropertyType(database, "Match Reason", [
    "rich_text"
  ]);
  const summaryKind = readOptionalPropertyType(database, "Summary", ["rich_text"]);
  const createdAtKind = readOptionalPropertyType(database, "Created At", [
    "date",
    "rich_text"
  ]);
  const updatedAtKind = readOptionalPropertyType(database, "Updated At", [
    "date",
    "rich_text"
  ]);

  return {
    statusKind: statusKind as NotionJobDatabaseSchema["statusKind"],
    sourceKind: sourceKind as NotionJobDatabaseSchema["sourceKind"],
    companyKind: companyKind as NotionJobDatabaseSchema["companyKind"],
    salaryKind: salaryKind as NotionJobDatabaseSchema["salaryKind"],
    locationKind: locationKind as NotionJobDatabaseSchema["locationKind"],
    matchScoreKind: matchScoreKind as NotionJobDatabaseSchema["matchScoreKind"],
    matchReasonKind: matchReasonKind as NotionJobDatabaseSchema["matchReasonKind"],
    summaryKind: summaryKind as NotionJobDatabaseSchema["summaryKind"],
    createdAtKind: createdAtKind as NotionJobDatabaseSchema["createdAtKind"],
    updatedAtKind: updatedAtKind as NotionJobDatabaseSchema["updatedAtKind"]
  };
}
