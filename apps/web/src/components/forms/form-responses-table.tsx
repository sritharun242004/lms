"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FileText, Search } from "lucide-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { answerFilePath } from "@/lib/forms/file-links";
import type { ResponseCell, ResponseTable } from "@/lib/forms/analytics";

// "name" and "submitted" are the fixed columns; a number is a question column.
type SortKey = "name" | "submitted" | number;
type Sort = { key: SortKey; dir: "asc" | "desc" };

// Short, single-value answers read best on one line; free text wraps.
const COMPACT_TYPES = new Set(["MULTIPLE_CHOICE", "DROPDOWN", "LINEAR_SCALE", "STAR_RATING", "DATE", "TIME"]);

function cellText(cell: ResponseCell): string {
  if (cell.kind === "text") return cell.text;
  if (cell.kind === "files") return cell.files.map((f) => f.fileName).join(" ");
  return "";
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function FormResponsesTable({ table }: { table: ResponseTable }) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<Sort>({ key: "submitted", dir: "asc" });

  const showSource = React.useMemo(
    () => new Set(table.rows.map((r) => r.source)).size > 1,
    [table.rows]
  );

  const visibleRows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? table.rows.filter(
          (row) =>
            row.name.toLowerCase().includes(needle) ||
            row.cells.some((cell) => cellText(cell).toLowerCase().includes(needle))
        )
      : table.rows;

    const valueOf = (row: ResponseTable["rows"][number]) =>
      sort.key === "name" ? row.name : sort.key === "submitted" ? row.submittedAt : cellText(row.cells[sort.key]);

    return [...matched].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      // Unanswered cells sink to the bottom whichever way the column sorts.
      if (!av || !bv) return av ? -1 : bv ? 1 : 0;
      const order = collator.compare(av, bv);
      return sort.dir === "asc" ? order : -order;
    });
  }, [table.rows, query, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  if (table.rows.length === 0) {
    return (
      <Card className="items-center px-6 py-12 text-center hover:translate-y-0">
        <p className="font-medium">No responses yet</p>
        <p className="max-w-sm text-muted-foreground">
          Each submission appears here as its own row, with every answer under its question.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search names and answers"
            aria-label="Search responses"
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {visibleRows.length === table.rows.length
            ? `${table.rows.length} ${table.rows.length === 1 ? "response" : "responses"}`
            : `${visibleRows.length} of ${table.rows.length} responses`}
        </p>
      </div>

      <Card className="gap-0 py-0 hover:translate-y-0 hover:shadow-none">
        <div className="max-h-[72vh] overflow-auto bg-card">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <HeaderCell sticky label={table.identityTitle} sortKey="name" sort={sort} onSort={toggleSort} />
                <HeaderCell label="Submitted" sortKey="submitted" sort={sort} onSort={toggleSort} />
                {table.columns.map((column, index) => (
                  <HeaderCell
                    key={column.questionId}
                    label={column.title}
                    sortKey={index}
                    sort={sort}
                    onSort={toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.responseId} className="group">
                  <td className="sticky left-0 z-10 min-w-[11rem] max-w-[16rem] border-r border-b border-border bg-card px-4 py-3 align-top font-medium group-hover:bg-muted">
                    {row.name}
                    {showSource ? (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {row.source === "PUBLIC_LINK" ? "Public link" : "Chat"}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className="border-b border-border px-4 py-3 align-top whitespace-nowrap text-muted-foreground tabular-nums group-hover:bg-muted"
                    suppressHydrationWarning
                  >
                    {format(new Date(row.submittedAt), "d MMM yyyy, h:mm a")}
                  </td>
                  {row.cells.map((cell, index) => (
                    <td
                      key={table.columns[index].questionId}
                      className={cn(
                        "border-b border-border px-4 py-3 align-top group-hover:bg-muted",
                        COMPACT_TYPES.has(table.columns[index].type)
                          ? "whitespace-nowrap tabular-nums"
                          : "min-w-[12rem] max-w-[22rem] whitespace-pre-line [overflow-wrap:anywhere]"
                      )}
                    >
                      <Cell cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 ? (
            <p className="px-4 py-10 text-center text-muted-foreground">
              No responses match “{query.trim()}”.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function HeaderCell({
  label,
  sortKey,
  sort,
  onSort,
  sticky = false,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  sticky?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "sticky top-0 z-20 min-w-[12rem] max-w-[18rem] border-b border-border bg-card px-4 py-3 text-left align-bottom font-medium",
        sticky && "left-0 z-30 border-r"
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={label}
        className={cn(
          "inline-flex items-start gap-1.5 rounded-sm text-left leading-snug transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <span className="line-clamp-3">{label}</span>
        <Icon className={cn("mt-0.5 size-3.5 shrink-0", !active && "opacity-50")} aria-hidden="true" />
      </button>
    </th>
  );
}

function Cell({ cell }: { cell: ResponseCell }) {
  if (cell.kind === "empty") {
    return (
      <span className="text-muted-foreground" aria-label="No answer">
        —
      </span>
    );
  }
  if (cell.kind === "files") {
    return (
      <ul className="flex flex-col gap-1">
        {cell.files.map((file) => (
          <li key={file.fileId}>
            <a
              href={answerFilePath(file.fileId)}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
            >
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              {file.fileName}
            </a>
          </li>
        ))}
      </ul>
    );
  }
  return <>{cell.text}</>;
}
