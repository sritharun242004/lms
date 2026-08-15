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
