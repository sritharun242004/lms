"use client";

import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle,
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  Play,
  Users,
  Download,
} from "lucide-react";
import {
  groupService,
  type ProfileMember,
  type SharedFile,
  type SharedKind,
  type SharedLink,
} from "@/lib/api/services/group-service";
import { groupByDate } from "@/lib/chat/date-groups";
import { getInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileTypeIcon, formatFileSize } from "@/components/chat/message-bubble";

/** Pages of an infinite list flattened, with repeats (same id) collapsed. */
function uniqueById<T extends { id: string }>(pages: { items: T[] }[] | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex items-center justify-center py-10 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertCircle className="size-7 text-destructive" />
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: typeof Users; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
      <Icon className="size-8" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs">{hint}</p>
    </div>
  );
}

function LoadMore({
  hasNextPage,
  fetching,
  onClick,
}: {
  hasNextPage: boolean;
  fetching: boolean;
  onClick: () => void;
}) {
  if (!hasNextPage) return null;
  return (
    <div className="flex justify-center py-3">
      <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={fetching}>
        {fetching && <Loader2 className="size-4 animate-spin" />}
        {fetching ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}

function useSharedPages<K extends SharedKind>(groupId: string, kind: K) {
  const query = useInfiniteQuery({
    queryKey: ["group-shared", groupId, kind],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await groupService.shared(groupId, kind, pageParam);
      if (!res.success || !res.data) throw new Error(res.error?.message || "Could not load shared content.");
      return res.data as { items: (K extends "links" ? SharedLink : SharedFile)[]; nextCursor: string | null };
    },
    getNextPageParam: (last) => last.nextCursor,
  });
  return query;
}

function senderLine(sender: { name: string } | null, sharedAt: string) {
  const when = format(new Date(sharedAt), "MMM d, yyyy");
  return sender ? `${sender.name} · ${when}` : when;
}

function DateHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="sticky top-0 z-[1] bg-background/90 px-1 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------- Members

export function MembersTab({ groupId }: { groupId: string }) {
  const query = useInfiniteQuery({
    queryKey: ["group-profile-members", groupId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await groupService.profileMembers(groupId, pageParam);
      if (!res.success || !res.data) throw new Error(res.error?.message || "Could not load members.");
      return res.data;
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const members = React.useMemo(() => {
    const seen = new Set<string>();
    const out: ProfileMember[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const member of page.members) {
        if (seen.has(member.userId)) continue;
        seen.add(member.userId);
        out.push(member);
      }
    }
    return out;
  }, [query.data]);

  if (query.isPending) return <Loading label="Loading members" />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (members.length === 0) {
    return <EmptyState icon={Users} title="No members yet" hint="People who join this group will appear here." />;
  }

  return (
    <div>
      <ul className="flex flex-col" aria-label="Group members">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/50">
            <Avatar className="size-10">
              <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
              <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium [overflow-wrap:anywhere]">{member.name}</span>
              <span className="text-xs text-muted-foreground">
                Joined {format(new Date(member.joinedAt), "MMM d, yyyy")}
              </span>
            </div>
            <Badge variant={member.role === "Admin" ? "secondary" : "outline"}>{member.role}</Badge>
          </li>
        ))}
      </ul>
      <LoadMore
        hasNextPage={Boolean(query.hasNextPage)}
        fetching={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Media

function MediaThumb({ item, onOpen }: { item: SharedFile; onOpen: (item: SharedFile) => void }) {
  const [failed, setFailed] = React.useState(false);
  const isVideo = item.mimeType.startsWith("video/");
  const src = `${item.url}?inline=1`;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`${isVideo ? "Play video" : "Open image"} ${item.fileName}`}
      className="group relative aspect-square overflow-hidden rounded-lg bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {failed ? (
        <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
          <ImageIcon className="size-6" aria-hidden />
          <span className="line-clamp-2 text-[10px] [overflow-wrap:anywhere]">{item.fileName}</span>
        </span>
      ) : isVideo ? (
        <>
          <video
            src={src}
            preload="metadata"
            muted
            playsInline
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Play className="size-7 fill-white text-white drop-shadow" aria-hidden />
          </span>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={item.fileName}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover transition-transform group-hover:scale-105"
        />
      )}
    </button>
  );
}

function MediaPreview({ item, onClose }: { item: SharedFile | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="[overflow-wrap:anywhere]">{item.fileName}</DialogTitle>
              <DialogDescription>{senderLine(item.sender, item.sharedAt)}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center rounded-2xl bg-muted/40 p-2">
              {item.mimeType.startsWith("video/") ? (
                <video src={`${item.url}?inline=1`} controls className="max-h-[65dvh] max-w-full rounded-xl" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${item.url}?inline=1`}
                  alt={item.fileName}
                  className="max-h-[65dvh] max-w-full rounded-xl object-contain"
                />
              )}
            </div>
            <Button asChild variant="outline" size="sm" className="self-start">
              <a href={item.url} download={item.fileName}>
                <Download className="size-4" />
                Download
              </a>
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MediaTab({ groupId }: { groupId: string }) {
  const query = useSharedPages(groupId, "media");
  const [preview, setPreview] = React.useState<SharedFile | null>(null);
  const items = React.useMemo(() => uniqueById(query.data?.pages as { items: SharedFile[] }[] | undefined), [query.data]);
  const groups = React.useMemo(() => groupByDate(items, (item) => item.sharedAt), [items]);

  if (query.isPending) return <Loading label="Loading media" />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (items.length === 0) {
    return <EmptyState icon={ImageIcon} title="No media yet" hint="Photos and videos shared in this group will appear here." />;
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.heading} aria-label={group.heading}>
          <DateHeading>{group.heading}</DateHeading>
          <div className="grid grid-cols-3 gap-1.5 pb-3 sm:grid-cols-4 md:grid-cols-5">
            {group.items.map((item) => (
              <MediaThumb key={item.id} item={item} onOpen={setPreview} />
            ))}
          </div>
        </section>
      ))}
      <LoadMore
        hasNextPage={Boolean(query.hasNextPage)}
        fetching={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      />
      <MediaPreview item={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

// -------------------------------------------------------------- Documents

function fileTypeLabel(fileName: string, mimeType: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot + 1) : "";
  if (ext && ext.length <= 6) return ext.toUpperCase();
  if (!mimeType || mimeType === "application/octet-stream") return "FILE";
  const sub = mimeType.split("/")[1];
  return sub ? sub.split(/[.+;-]/).pop()!.toUpperCase().slice(0, 6) : "FILE";
}

export function DocumentsTab({ groupId }: { groupId: string }) {
  const query = useSharedPages(groupId, "documents");
  const items = React.useMemo(() => uniqueById(query.data?.pages as { items: SharedFile[] }[] | undefined), [query.data]);
  const groups = React.useMemo(() => groupByDate(items, (item) => item.sharedAt), [items]);

  if (query.isPending) return <Loading label="Loading documents" />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (items.length === 0) {
    return <EmptyState icon={FileText} title="No documents yet" hint="Files shared in this group will appear here." />;
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.heading} aria-label={group.heading}>
          <DateHeading>{group.heading}</DateHeading>
          <ul className="flex flex-col gap-1 pb-3">
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.url}
                  download={item.fileName}
                  className="flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 hover:border-border hover:bg-muted/50"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileTypeIcon mimeType={item.mimeType} fileName={item.fileName} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]" title={item.fileName}>
                      {item.fileName}
                    </span>
                    <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {[
                        fileTypeLabel(item.fileName, item.mimeType),
                        item.size > 0 ? formatFileSize(item.size) : null,
                        senderLine(item.sender, item.sharedAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="sr-only">Download {item.fileName}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <LoadMore
        hasNextPage={Boolean(query.hasNextPage)}
        fetching={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Links

export function LinksTab({ groupId }: { groupId: string }) {
  const query = useSharedPages(groupId, "links");
  const items = React.useMemo(() => uniqueById(query.data?.pages as { items: SharedLink[] }[] | undefined), [query.data]);
  const groups = React.useMemo(() => groupByDate(items, (item) => item.sharedAt), [items]);

  if (query.isPending) return <Loading label="Loading links" />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (items.length === 0) {
    return <EmptyState icon={Link2} title="No links yet" hint="Links shared in this group will appear here." />;
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.heading} aria-label={group.heading}>
          <DateHeading>{group.heading}</DateHeading>
          <ul className="flex flex-col gap-1 pb-3">
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-start gap-3 rounded-xl border border-transparent px-2 py-2",
                    "hover:border-border hover:bg-muted/50"
                  )}
                >
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Link2 className="size-5" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium [overflow-wrap:anywhere]">{item.domain}</span>
                    <span className="line-clamp-2 text-xs text-primary [overflow-wrap:anywhere]">{item.url}</span>
                    <span className="text-xs text-muted-foreground">{senderLine(item.sender, item.sharedAt)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <LoadMore
        hasNextPage={Boolean(query.hasNextPage)}
        fetching={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      />
    </div>
  );
}
