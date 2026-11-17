/** Plain labels for the nine lifestyle fields. The API sends the field names. */
export const FIELD_LABELS: Record<string, string> = {
  status: "Relationship status",
  job: "Work",
  education_level: "Education",
  offspring: "Children",
  pets: "Pets",
  diet_type: "Diet",
  smokes: "Smoking",
  drugs: "Drugs",
  body_type: "Body type",
};

export const FIELD_ORDER = ["status", "job", "education_level", "offspring", "pets", "diet_type", "smokes", "drugs", "body_type"];

export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field.replaceAll("_", " ");
