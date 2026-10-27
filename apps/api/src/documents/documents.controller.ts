import { Controller, Get, Inject, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser, Roles, STAFF_ROLES, type AuthUser } from "../auth/guard";
import { DocumentsService } from "./documents.service";

const send = (res: Response, doc: { bytes: Uint8Array; fileName: string }) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.end(Buffer.from(doc.bytes));
};

/** Customers: their own quotes and agreements. */
@Controller()
export class CustomerDocumentsController {
  constructor(@Inject(DocumentsService) private readonly docs: DocumentsService) {}

  @Get("quotes/:id/pdf")
  async quote(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    send(res, await this.docs.quote(user, id));
  }

  @Get("contracts/:id/pdf")
  async contract(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    send(res, await this.docs.contract(user, id));
  }
}

/** Staff: any quote or agreement (same customer-facing document — no internal costs). */
@Controller("admin")
@Roles(...STAFF_ROLES)
export class StaffDocumentsController {
  constructor(@Inject(DocumentsService) private readonly docs: DocumentsService) {}

  @Get("quotes/:id/pdf")
  async quote(@Param("id") id: string, @Res() res: Response) {
    send(res, await this.docs.quote(null, id));
  }

  @Get("contracts/:id/pdf")
  async contract(@Param("id") id: string, @Res() res: Response) {
    send(res, await this.docs.contract(null, id));
  }
}
