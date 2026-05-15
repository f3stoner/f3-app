export async function triagePotentialMemberMisassignments({
    minSuspiciousRefs = 10,
    regionId = state.currentRegionId,
  
  } = {}) {
    const auditRows = await auditPotentialMergedMembers();
    const triageRows = [];
  
    for (const row of auditRows) {
      if (row.currentMemberCount <= 1) continue;
      const detail = await auditMergedMemberDetail(row.looseKey);
      const members = row.currentMembers || [];
      const totalRefs = members.reduce((sum, member) => sum + member.sessionRefs, 0);
      const sortedMembers = [...members].sort((a, b) => b.sessionRefs - a.sessionRefs);
      const topMember = sortedMembers[0];
      const secondMember = sortedMembers[1];
  
      const rawNames = [
        ...detail.rawAoRows.map(r => r.rawPaxName),
        ...detail.historicRows.map(r => r.rawPaxName),
      ];
  
      const rawNameCounts = rawNames.reduce((acc, name) => {
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {});
  
      const likelySuffixOwner =
        /\((dr|inactive|dj)\)/i.test(topMember.paxName);
  
      const plainMember = members.find(member =>
        !/\(.*?\)/.test(member.paxName)
      );
  
      const hasBigSkew =
        topMember.sessionRefs >= minSuspiciousRefs &&
        (!secondMember || topMember.sessionRefs >= secondMember.sessionRefs * 5);
  
      let classification = "review";
      let confidence = "medium";
      let suggestedAction = "Inspect manually";
  
      if (likelySuffixOwner && plainMember && hasBigSkew) {
        classification = "likely_misassigned";
        confidence = "high";
        suggestedAction = `Review "${topMember.paxName}" as possible wrong owner. Use raw evidence to move sessions to the correct member(s).`;
  
      } else if (totalRefs === 0) {
        classification = "safe_no_sessions";
        confidence = "high";
        suggestedAction = "No session refs. Safe to ignore for analytics.";
      } else if (!hasBigSkew) {
        classification = "probably_safe_or_legit_split";
        confidence = "low";
        suggestedAction = "Counts are not heavily skewed. Defer unless stats look wrong.";
      }
  
      triageRows.push({
        looseKey: row.looseKey,
        classification,
        confidence,
        suggestedAction,
        rosterNames: row.rosterNames,
        members: members.map(member => ({
          paxName: member.paxName,
          id: member.id,
          sessionRefs: member.sessionRefs,
        })),
  
        rawNameCounts,
        topMember: topMember?.paxName || null,
        topRefs: topMember?.sessionRefs || 0,
        totalRefs,
      });
    }
  
    console.table(triageRows.map(row => ({
      looseKey: row.looseKey,
      classification: row.classification,
      confidence: row.confidence,
      topMember: row.topMember,
      topRefs: row.topRefs,
      members: row.members.map(m => `${m.paxName}:${m.sessionRefs}`).join(" | "),
      rawNames: Object.entries(row.rawNameCounts)
        .map(([name, count]) => `${name}:${count}`)
        .join(" | "),
      suggestedAction: row.suggestedAction,
    })));
  
    return triageRows;
  }