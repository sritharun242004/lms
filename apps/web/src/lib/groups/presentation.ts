import type { GroupCard } from "@/lib/api/services/group-service";

function matchesSearch(group: GroupCard, query: string) {
  const haystack = [group.name, group.description, group.mentorName, group.inviteCode?.code]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  return haystack.includes(query);
}

export function getVisibleGroups(groups: GroupCard[], search: string): GroupCard[] {
  const query = search.trim().toLocaleLowerCase();

  return [...groups]
    .filter((group) => !query || matchesSearch(group, query))
    .sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );
}

/**
 * Formats a past timestamp for the "last active" line on a group card.
 * Within the last 24h it stays in minutes/hours ("5m ago", "3h ago"); beyond
 * that it steps up to days/weeks/months/years so old groups don't show a
 * three-digit hour count.
 */
export function formatLastActive(lastActivityAt: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(lastActivityAt).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < day) {
    const minutes = Math.floor(diffMs / minute);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(diffMs / hour)}h ago`;
  }

  const days = Math.floor(diffMs / day);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
