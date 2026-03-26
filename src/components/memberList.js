export function renderMemberList(members) {
    return members.map(m => `<div class="member">${m.name}</div>`).join("");
}