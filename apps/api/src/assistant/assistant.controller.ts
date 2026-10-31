import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { AssistantChatSchema, AssistantSettingsSchema } from "@repo/schemas";
import { parse } from "../common/validate";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/guard";
import { AssistantService } from "./assistant.service";

/** The website's assistant. Open to everyone, like the catalogue it reads. */
@Controller("assistant")
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly assistant: AssistantService) {}

  @Public()
  @Get("status")
  status() {
    return this.assistant.status();
  }

  @Public()
  @Post("chat")
  @HttpCode(200)
  chat(@Req() req: Request, @Body() body: unknown) {
    return this.assistant.chat(parse(AssistantChatSchema, body), req.ip ?? "unknown");
  }
}

/** CRM → API. The saved key is never returned. The super admin only. */
@Controller("admin/assistant")
@Roles("SUPER_ADMIN")
export class AssistantAdminController {
  constructor(@Inject(AssistantService) private readonly assistant: AssistantService) {}

  @Get()
  settings() {
    return this.assistant.settings();
  }

  @Put()
  save(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.assistant.save(user, parse(AssistantSettingsSchema, body));
  }

  @Post("test")
  @HttpCode(200)
  test() {
    return this.assistant.test();
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser) {
    return this.assistant.remove(user);
  }
}
