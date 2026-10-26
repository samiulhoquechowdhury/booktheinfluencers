// Shapes shared by both transports (mock-client.ts, http-client.ts).

export type Role = "SUPER_ADMIN" | "SALES" | "TALENT_MANAGER" | "OPS" | "ACCOUNTS" | "TALENT" | "REP" | "CUSTOMER";

export type Session = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  roles: Role[];
  talentSlug: string | null;
};

export type Message = { id: string; author: "customer" | "talent" | "staff"; authorName: string; body: string; at: string };
