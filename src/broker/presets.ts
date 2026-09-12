export type ServicePreset = {
  id: string;
  label: string;
  nickname: string;
  base_url: string;
  header_name: string;
  header_template: string;
  try_path: string;
};

export const SERVICE_PRESETS: ServicePreset[] = [
  {
    id: "stripe",
    label: "Stripe",
    nickname: "Stripe",
    base_url: "https://api.stripe.com",
    header_name: "Authorization",
    header_template: "Bearer {{key}}",
    try_path: "/v1/balance",
  },
  {
    id: "openai",
    label: "OpenAI",
    nickname: "OpenAI",
    base_url: "https://api.openai.com",
    header_name: "Authorization",
    header_template: "Bearer {{key}}",
    try_path: "/v1/models",
  },
  {
    id: "jsonplaceholder",
    label: "Practice (no real key)",
    nickname: "jsonplaceholder",
    base_url: "https://jsonplaceholder.typicode.com",
    header_name: "Authorization",
    header_template: "Bearer {{key}}",
    try_path: "/todos/1",
  },
];

export function presetById(id: string | undefined): ServicePreset | undefined {
  if (!id) return undefined;
  return SERVICE_PRESETS.find((p) => p.id === id);
}
