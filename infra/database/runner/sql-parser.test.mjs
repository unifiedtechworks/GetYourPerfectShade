import { describe, expect, it } from "vitest";
import {
  DATA_API_SQL_MAX_BYTES,
  splitPostgresStatements,
  validateStatements,
} from "./sql-parser.mjs";

describe("PostgreSQL-aware SQL handling", () => {
  it("preserves functions, dollar quotes, comments, and quoted semicolons", () => {
    const sql = `
      -- leading comment;
      create function example() returns void language plpgsql as $body$
      begin
        perform 'value;still-in-string';
      end
      $body$;
      /* nested /* comment; */ still comment */
      insert into example_table(value) values ('one;two');
    `;
    const statements = splitPostgresStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("perform 'value;still-in-string'");
    expect(statements[1]).toContain("'one;two'");
  });

  it("rejects unterminated procedural SQL", () => {
    expect(() => splitPostgresStatements("do $$ begin perform 1;")).toThrow(
      /unterminated dollar quote/,
    );
  });

  it("distinguishes standard strings from PostgreSQL escape strings", () => {
    expect(splitPostgresStatements("select 'C:\\'; select 2;")).toHaveLength(2);
    expect(
      splitPostgresStatements("select E'it\\'s;fine'; select 2;"),
    ).toHaveLength(2);
  });

  it("rejects transaction-unsafe operations before execution", () => {
    expect(() =>
      validateStatements(
        ["create index concurrently example_idx on example(id);"],
        "0003_unsafe.sql",
      ),
    ).toThrowError(/cannot run safely inside the managed transaction/);
  });

  it("rejects statements above the Data API SQL limit", () => {
    const statement = `select '${"x".repeat(DATA_API_SQL_MAX_BYTES)}';`;
    expect(() =>
      validateStatements([statement], "0003_large.sql"),
    ).toThrowError(/65,536-byte Data API limit/);
  });
});
