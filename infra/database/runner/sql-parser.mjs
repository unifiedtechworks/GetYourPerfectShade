import { MigrationRunnerError } from "./errors.mjs";

export const DATA_API_SQL_MAX_BYTES = 65_536;

function dollarTagAt(sql, index) {
  const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index));
  return match?.[0] ?? null;
}

function usesBackslashEscapes(sql, quoteIndex) {
  return /(?:^|[^A-Za-z0-9_$])(?:E|U&)$/.test(
    sql.slice(0, quoteIndex).toUpperCase(),
  );
}

export function splitPostgresStatements(sql) {
  const statements = [];
  let current = "";
  let state = "normal";
  let dollarTag = "";
  let blockDepth = 0;
  let backslashEscapes = false;

  const push = () => {
    const statement = current.trim();
    if (stripSqlComments(statement).trim()) statements.push(statement);
    current = "";
  };

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];
    current += character;

    if (state === "line-comment") {
      if (character === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      if (character === "/" && next === "*") {
        current += next;
        index += 1;
        blockDepth += 1;
      } else if (character === "*" && next === "/") {
        current += next;
        index += 1;
        blockDepth -= 1;
        if (blockDepth === 0) state = "normal";
      }
      continue;
    }
    if (state === "single-quote") {
      if (backslashEscapes && character === "\\" && next !== undefined) {
        current += next;
        index += 1;
      } else if (character === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (character === "'") {
        state = "normal";
      }
      continue;
    }
    if (state === "double-quote") {
      if (character === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (character === '"') {
        state = "normal";
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (sql.startsWith(dollarTag, index)) {
        current += sql.slice(index + 1, index + dollarTag.length);
        index += dollarTag.length - 1;
        state = "normal";
      }
      continue;
    }

    if (character === "-" && next === "-") {
      current += next;
      index += 1;
      state = "line-comment";
    } else if (character === "/" && next === "*") {
      current += next;
      index += 1;
      blockDepth = 1;
      state = "block-comment";
    } else if (character === "'") {
      backslashEscapes = usesBackslashEscapes(sql, index);
      state = "single-quote";
    } else if (character === '"') {
      state = "double-quote";
    } else if (character === "$") {
      const tag = dollarTagAt(sql, index);
      if (tag) {
        current += sql.slice(index + 1, index + tag.length);
        index += tag.length - 1;
        dollarTag = tag;
        state = "dollar-quote";
      }
    } else if (character === ";") {
      push();
    }
  }

  if (!["normal", "line-comment"].includes(state)) {
    throw new MigrationRunnerError(
      "INVALID_SQL",
      `Migration SQL ends inside an unterminated ${state.replace("-", " ")}.`,
    );
  }
  push();
  return statements;
}

export function stripSqlComments(sql) {
  let output = "";
  let state = "normal";
  let blockDepth = 0;
  let dollarTag = "";
  let backslashEscapes = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (state === "line-comment") {
      if (character === "\n") {
        output += "\n";
        state = "normal";
      }
      continue;
    }
    if (state === "block-comment") {
      if (character === "/" && next === "*") {
        blockDepth += 1;
        index += 1;
      } else if (character === "*" && next === "/") {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = "normal";
      }
      continue;
    }
    if (state === "single-quote") {
      output += character;
      if (backslashEscapes && character === "\\" && next !== undefined) {
        output += next;
        index += 1;
      } else if (character === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (character === "'") {
        state = "normal";
      }
      continue;
    }
    if (state === "double-quote") {
      output += character;
      if (character === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (character === '"') {
        state = "normal";
      }
      continue;
    }
    if (state === "dollar-quote") {
      output += character;
      if (sql.startsWith(dollarTag, index)) {
        output += sql.slice(index + 1, index + dollarTag.length);
        index += dollarTag.length - 1;
        state = "normal";
      }
      continue;
    }

    if (character === "-" && next === "-") {
      state = "line-comment";
      index += 1;
    } else if (character === "/" && next === "*") {
      state = "block-comment";
      blockDepth = 1;
      index += 1;
    } else {
      output += character;
      if (character === "'") {
        backslashEscapes = usesBackslashEscapes(sql, index);
        state = "single-quote";
      }
      else if (character === '"') state = "double-quote";
      else if (character === "$") {
        const tag = dollarTagAt(sql, index);
        if (tag) {
          output += sql.slice(index + 1, index + tag.length);
          index += tag.length - 1;
          dollarTag = tag;
          state = "dollar-quote";
        }
      }
    }
  }
  return output;
}

const TRANSACTION_UNSAFE_PATTERNS = [
  /^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE\s+SAVEPOINT)\b/i,
  /^\s*(?:CREATE|DROP)\s+DATABASE\b/i,
  /^\s*ALTER\s+SYSTEM\b/i,
  /^\s*VACUUM\b/i,
  /^\s*CREATE\s+TABLESPACE\b/i,
  /^\s*DROP\s+TABLESPACE\b/i,
  /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i,
  /^\s*DROP\s+INDEX\s+CONCURRENTLY\b/i,
  /^\s*REINDEX\b[\s\S]*\bCONCURRENTLY\b/i,
  /^\s*REFRESH\s+MATERIALIZED\s+VIEW\s+CONCURRENTLY\b/i,
  /^\s*COPY\b[\s\S]*\bFROM\s+STDIN\b/i,
  /^\s*\\/i,
];

export function validateStatements(statements, filename) {
  if (statements.length === 0) {
    throw new MigrationRunnerError(
      "EMPTY_MIGRATION",
      `Migration ${filename} contains no executable SQL.`,
    );
  }
  for (const [index, statement] of statements.entries()) {
    const size = Buffer.byteLength(statement, "utf8");
    if (size > DATA_API_SQL_MAX_BYTES) {
      throw new MigrationRunnerError(
        "DATA_API_STATEMENT_TOO_LARGE",
        `Migration ${filename} statement ${index + 1} is ${size} UTF-8 bytes; split it below the 65,536-byte Data API limit.`,
      );
    }
    const executable = stripSqlComments(statement).trim();
    if (TRANSACTION_UNSAFE_PATTERNS.some((pattern) => pattern.test(executable))) {
      throw new MigrationRunnerError(
        "TRANSACTION_UNSAFE_SQL",
        `Migration ${filename} statement ${index + 1} cannot run safely inside the managed transaction. Move it to a separately reviewed administrative procedure.`,
      );
    }
  }
}
