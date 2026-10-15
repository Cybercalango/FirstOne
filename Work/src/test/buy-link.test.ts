import { describe, expect, it } from "vitest";

import { parseBuyLink } from "@/lib/catalog";

describe("Purchase link rules", () => {
  it("keeps a complete web address", () => {
    expect(parseBuyLink("https://wa.me/5584999999999")).toEqual({
      link: "https://wa.me/5584999999999",
      error: null,
    });
  });

  it("adds https when the address is typed without a protocol", () => {
    expect(parseBuyLink("lojafloredapele.com.br/colar-ponto-de-luz")).toEqual({
      link: "https://lojafloredapele.com.br/colar-ponto-de-luz",
      error: null,
    });
  });

  it("treats an empty field as no purchase link at all", () => {
    expect(parseBuyLink("   ")).toEqual({ link: null, error: null });
    expect(parseBuyLink(null)).toEqual({ link: null, error: null });
  });

  it("refuses addresses that are not a web page", () => {
    expect(parseBuyLink("ftp://arquivos/colar").error).toContain("http");
    expect(parseBuyLink("https://loja").error).toContain("endereço completo");
    expect(parseBuyLink("https://loja.com.br/pa gina").error).toContain("espaços");
  });
});
