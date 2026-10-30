import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env";
import { DomainError } from "../common/errors";

// Encrypts ID documents before they reach the database, so a leaked database or backup doesn't expose anyone's ID.
// Each file gets its own random key (AES-256-GCM), which is itself encrypted with ID_DOCUMENT_KEY, kept only in the
// server's environment. The owning talent's id is bound in, so a row can't be moved onto another artist.
// Layout: magic(4) | wrapIv(12) | wrapTag(16) | wrappedKey(32) | iv(12) | tag(16) | ciphertext

const MAGIC = Buffer.from("IDV1");
const IV = 12;
const TAG = 16;
const KEY = 32;
const HEADER = MAGIC.length + IV + TAG + KEY + IV + TAG;

const masterKey = () => Buffer.from(env.ID_DOCUMENT_KEY, "base64");

function encrypt(key: Buffer, plain: Buffer, aad: string) {
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", key, iv).setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), body };
}

function decrypt(key: Buffer, iv: Buffer, tag: Buffer, body: Buffer, aad: string) {
  const decipher = createDecipheriv("aes-256-gcm", key, iv).setAAD(Buffer.from(aad)).setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function sealDocument(plain: Buffer, talentId: string): Uint8Array<ArrayBuffer> {
  const fileKey = randomBytes(KEY);
  const wrapped = encrypt(masterKey(), fileKey, talentId);
  const file = encrypt(fileKey, plain, talentId);
  return new Uint8Array(Buffer.concat([MAGIC, wrapped.iv, wrapped.tag, wrapped.body, file.iv, file.tag, file.body]));
}

/** Fails closed: anything that isn't intact, or belongs to another artist, is refused. */
export function openDocument(sealed: Uint8Array, talentId: string): Buffer {
  const blob = Buffer.from(sealed);
  try {
    if (blob.length < HEADER || !blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a sealed document");
    let at = MAGIC.length;
    const take = (n: number) => blob.subarray(at, (at += n));
    const wrapIv = take(IV);
    const wrapTag = take(TAG);
    const wrappedKey = take(KEY);
    const iv = take(IV);
    const tag = take(TAG);
    const fileKey = decrypt(masterKey(), wrapIv, wrapTag, wrappedKey, talentId);
    return decrypt(fileKey, iv, tag, blob.subarray(at), talentId);
  } catch {
    throw new DomainError("DOCUMENT_UNREADABLE", "This document can't be opened. Ask the artist to upload it again.", 422);
  }
}
