import React, { useState, useMemo, useRef } from "react";
import Papa from "papaparse";

// ---------- helpers ----------
const norm = (s) => (s || "").toString().trim();
const key = (s) => norm(s).toLowerCase();

function parseCSV(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: true });
  return res.data.map((row) => {
    const out = {};
    Object.keys(row).forEach((k) => (out[norm(k)] = norm(row[k])));
    return out;
  });
}

function loadPlayers(text) {
  return parseCSV(text).map((r, i) => ({
    idx: i,
    name: r["Name"],
    birthYear: parseInt(r["Year of Birth"], 10),
    rating: parseInt(r["Rating"], 10),
    gender: r["Gender"],
    position: r["Position"], // Goalie / Forward / Defense
    teammateRequest: r["Teammate Request"],
    teammateReason: r["Teammate Reason"],
  }));
}

function loadCoaches(text) {
  return parseCSV(text).map((r, i) => ({
    idx: i,
    name: r["Coach"],
    role: r["Role"],
    requests: [
      r["Coach Request 1"],
      r["Coach Request 2"],
      r["Coach Request 3"],
    ].filter((x) => x),
    childNames: (r["Childs Names"] || "")
      .split(";")
      .map((s) => norm(s))
      .filter((x) => x),
  }));
}

// Union-Find
class UF {
  constructor(n) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x) {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a),
      rb = this.find(b);
    if (ra !== rb) this.p[ra] = rb;
  }
}

// ---------- mock data generator ----------
const MOCK_FIRST_M = [
  "Liam","Noah","Oliver","Elijah","James","William","Benjamin","Lucas","Henry","Alexander",
  "Mason","Michael","Ethan","Daniel","Jacob","Logan","Jackson","Levi","Sebastian","Mateo",
  "Jack","Owen","Theodore","Aiden","Samuel","Joseph","John","David","Wyatt","Matthew",
  "Luke","Asher","Carter","Julian","Grayson","Leo","Jayden","Gabriel","Isaac","Lincoln",
  "Anthony","Hudson","Dylan","Ezra","Thomas","Charles","Christopher","Jaxon","Maverick","Josiah",
  "Ryan","Nathan","Adrian","Christian","Cameron","Colton","Brayden","Cooper","Eli","Landon",
];
const MOCK_FIRST_F = [
  "Olivia","Emma","Charlotte","Amelia","Sophia","Isabella","Ava","Mia","Evelyn","Luna",
  "Harper","Camila","Sofia","Scarlett","Elizabeth","Eleanor","Emily","Chloe","Mila","Violet",
  "Penelope","Gianna","Aria","Abigail","Ella","Avery","Layla","Nora","Hazel","Zoey",
  "Riley","Lily","Ellie","Stella","Aurora","Natalie","Grace","Maya","Addison","Skylar",
];
const MOCK_LAST = [
  "Smith","Brown","Tremblay","Martin","Roy","Gagnon","Ouellet","Belliveau","LeBlanc","Cormier",
  "Doucet","Arsenault","Landry","Boudreau","Melanson","Comeau","Robichaud","Savoie","Thibodeau","Richard",
  "Chiasson","Hebert","Poirier","Levesque","Gallant","Wilson","Taylor","Clark","Walker","Young",
  "MacDonald","Stewart","Campbell","Fraser","Mitchell","Reid","Murray","Ross","Grant","Sinclair",
  "Doiron","Basque","Boucher","Bourque","Caissie","Daigle","Godin","Guerette","Haché","Vautour",
];

// picks a team count that's always guaranteed to fit `numPlayers` under the
// app's own roster caps (17 skaters / 1-2 goalies per team), instead of a
// fixed number that might not fit — this is what broke the earlier
// division presets, so the generator works it out itself every time
function computeSafeTeamCount(numPlayers) {
  let teams = Math.max(1, Math.ceil(numPlayers / 18));
  for (let guard = 0; guard < 200; guard++) {
    const goalies = Math.min(teams * 2, Math.max(teams, Math.round(numPlayers * 0.075)));
    const skaters = numPlayers - goalies;
    if (skaters <= teams * 17 && goalies >= teams && goalies <= teams * 2) {
      return teams;
    }
    teams++;
  }
  return teams;
}

function generateMockData(numPlayers) {
  const used = new Set();
  const makeName = (gender) => {
    for (let tries = 0; tries < 500; tries++) {
      const fn = gender === "Male"
        ? MOCK_FIRST_M[Math.floor(Math.random() * MOCK_FIRST_M.length)]
        : MOCK_FIRST_F[Math.floor(Math.random() * MOCK_FIRST_F.length)];
      const ln = MOCK_LAST[Math.floor(Math.random() * MOCK_LAST.length)];
      const name = `${fn} ${ln}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    // exhausted the pool (only possible at very high player counts) — fall
    // back to a numbered suffix so generation never fails
    const name = `${gender === "Male" ? "Player" : "Player"} ${used.size + 1}`;
    used.add(name);
    return name;
  };

  const teamCount = computeSafeTeamCount(numPlayers);
  const birthYears = [new Date().getFullYear() - 11, new Date().getFullYear() - 10];

  const goalieCount = Math.min(teamCount * 2, Math.max(teamCount, Math.round(numPlayers * 0.075)));
  const skaterCount = numPlayers - goalieCount;
  const fwdCount = Math.round(skaterCount * 0.561);
  const defCount = skaterCount - fwdCount;
  const femaleGoalies = Math.round(goalieCount * 0.28);
  const femaleSkaters = Math.round(skaterCount * 0.2);

  const players = [];
  const femaleGoalieSlots = new Set();
  while (femaleGoalieSlots.size < femaleGoalies && femaleGoalieSlots.size < goalieCount) {
    femaleGoalieSlots.add(Math.floor(Math.random() * goalieCount));
  }
  for (let i = 0; i < goalieCount; i++) {
    const gender = femaleGoalieSlots.has(i) ? "Female" : "Male";
    players.push({
      name: makeName(gender),
      birthYear: birthYears[Math.floor(Math.random() * birthYears.length)],
      rating: 2 + Math.floor(Math.random() * 4),
      gender,
      position: "Goalie",
      teammateRequest: "",
      teammateReason: "",
    });
  }

  const positions = [
    ...Array(fwdCount).fill("Forward"),
    ...Array(defCount).fill("Defense"),
  ];
  const genders = [
    ...Array(femaleSkaters).fill("Female"),
    ...Array(skaterCount - femaleSkaters).fill("Male"),
  ];
  // shuffle both independently
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  for (let i = genders.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [genders[i], genders[j]] = [genders[j], genders[i]];
  }

  const skaters = [];
  for (let i = 0; i < skaterCount; i++) {
    skaters.push({
      name: makeName(genders[i]),
      birthYear: birthYears[Math.floor(Math.random() * birthYears.length)],
      rating: 1 + Math.floor(Math.random() * 5),
      gender: genders[i],
      position: positions[i],
      teammateRequest: "",
      teammateReason: "",
    });
  }

  // teammate requests, scaled relative to the original 98-skater baseline
  const scale = skaterCount / 98;
  const nSibling = Math.max(0, Math.round(6 * scale));
  const nAvoid = Math.max(0, Math.round(4 * scale));
  const nTransport = Math.max(0, Math.round(8 * scale));
  const nFriend = Math.max(0, Math.round(12 * scale));

  const pool = [...skaters];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let pIdx = 0;
  const setRequest = (a, b, reasonA, reasonB) => {
    a.teammateRequest = b.name;
    a.teammateReason = reasonA;
    if (reasonB) {
      b.teammateRequest = a.name;
      b.teammateReason = reasonB;
    }
  };
  for (let i = 0; i < nSibling && pIdx + 1 < pool.length; i++, pIdx += 2)
    setRequest(pool[pIdx], pool[pIdx + 1], "Sibling", "Sibling");
  for (let i = 0; i < nAvoid && pIdx + 1 < pool.length; i++, pIdx += 2)
    setRequest(pool[pIdx], pool[pIdx + 1], "Avoid", "Avoid");
  for (let i = 0; i < nTransport && pIdx + 1 < pool.length; i++, pIdx += 2)
    setRequest(pool[pIdx], pool[pIdx + 1], "Transportation");
  for (let i = 0; i < nFriend && pIdx + 1 < pool.length; i++, pIdx += 2)
    setRequest(pool[pIdx], pool[pIdx + 1], "Friend");

  const allPlayers = [...players, ...skaters];
  for (let i = allPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
  }

  const playersCSV = [
    "Name,Year of Birth,Rating,Gender,Position,Teammate Request,Teammate Reason",
    ...allPlayers.map((p) =>
      [p.name, p.birthYear, p.rating, p.gender, p.position, p.teammateRequest, p.teammateReason]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  // coaches: one Head row per team, plus a handful of Assistant rows. Each
  // assistant lists up to 3 "who I want to coach with" requests — most list
  // their intended head coach as request #1 so they land correctly, a few
  // have none at all (to exercise the fallback distribution for coaches with
  // no successful request), and one team deliberately has zero assistants.
  const kidsPool = [...skaters];
  for (let i = kidsPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kidsPool[i], kidsPool[j]] = [kidsPool[j], kidsPool[i]];
  }
  const noAssistantIdx = Math.floor(teamCount / 3);
  const noKidsHeadIdx = Math.floor(teamCount / 2);
  let kIdx = 0;
  const csvRow = (vals) => vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  const coachRows = ["Coach,Role,Coach Request 1,Coach Request 2,Coach Request 3,Childs Names"];
  const headNames = [];
  for (let i = 0; i < teamCount; i++) {
    const cGender = i % 3 === 2 ? "Female" : "Male";
    const headName = makeName(cGender);
    headNames.push(headName);
    const nKids = i === noKidsHeadIdx ? 0 : Math.random() < 0.67 ? 1 : 2;
    const kids = kidsPool.slice(kIdx, kIdx + nKids).map((k) => k.name);
    kIdx += nKids;
    coachRows.push(csvRow([headName, "Head", "", "", "", kids.join("; ")]));
  }
  for (let i = 0; i < teamCount; i++) {
    const nAsst = i === noAssistantIdx ? 0 : 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < nAsst; j++) {
      const aName = makeName(Math.random() < 0.5 ? "Male" : "Female");
      const hasKid = Math.random() < 0.2;
      const kids = hasKid ? kidsPool.slice(kIdx, kIdx + 1).map((k) => k.name) : [];
      if (hasKid) kIdx += 1;
      coachRows.push(csvRow([aName, "Assistant", headNames[i], "", "", kids.join("; ")]));
    }
  }
  if (teamCount > 0) {
    const floatName = makeName(Math.random() < 0.5 ? "Male" : "Female");
    coachRows.push(csvRow([floatName, "Assistant", "", "", "", ""]));
  }
  const coachesCSV = coachRows.join("\n");

  return {
    playersCSV,
    coachesCSV,
    teamCount,
    goalieCount,
    skaterCount,
    totalPlayers: numPlayers,
    birthYears,
  };
}

// ---------- core build ----------
function buildTeams(players, coaches, numTeams) {
  const errors = [];
  const warnings = [];

  const headCoaches = coaches.filter((c) => key(c.role) === "head");
  const isHead = (c) => key(c.role) === "head";

  if (headCoaches.length !== numTeams) {
    errors.push(
      `Team count mismatch: you set ${numTeams} teams, but the coach file has ${headCoaches.length} coaches marked Role = Head. Each team needs exactly one head coach.`
    );
  }
  const teamCount = Math.min(numTeams, headCoaches.length) || numTeams;

  // head coach original index -> team index (0..teamCount-1), in CSV order
  const headTeamIdx = {};
  headCoaches.slice(0, teamCount).forEach((c, ti) => {
    headTeamIdx[c.idx] = ti;
  });
  const teamHeadName = Array.from(
    { length: teamCount },
    (_, ti) => headCoaches[ti]?.name || `(missing head coach ${ti + 1})`
  );

  // ---- resolve "who I want to coach with" requests into teams ----
  // Every coach (head or assistant) can list up to 3 other coaches they want
  // to coach with. This is treated as a hard, highest-priority requirement:
  // requested coaches are grouped together and placed on the same team
  // whenever that's possible. The only time it truly can't be honored is
  // when a chain of requests would merge two different head coaches' teams
  // into one — that specific request is refused and reported as an error,
  // rather than silently dropped.
  const coachByName = {};
  coaches.forEach((c) => {
    if (c.name) coachByName[key(c.name)] = c;
  });
  const coachNameCounts = {};
  coaches.forEach((c) => {
    const k = key(c.name);
    if (!k) return;
    coachNameCounts[k] = (coachNameCounts[k] || 0) + 1;
  });
  Object.entries(coachNameCounts).forEach(([k, count]) => {
    if (count > 1) {
      const displayName = coaches.find((c) => key(c.name) === k)?.name || k;
      warnings.push(
        `"${displayName}" appears more than once in the coaches list — coaching requests referencing this name may not resolve to the row you expect.`
      );
    }
  });
  const cuf = new UF(coaches.length);
  const headsInGroup = (root) =>
    coaches.filter((c) => cuf.find(c.idx) === root && isHead(c));

  coaches.forEach((c) => {
    (c.requests || []).forEach((reqName) => {
      if (!reqName) return;
      const target = coachByName[key(reqName)];
      if (!target) {
        warnings.push(
          `${c.name}'s coaching request "${reqName}" was not found in the coaches list.`
        );
        return;
      }
      if (target.idx === c.idx) return;
      const rootA = cuf.find(c.idx);
      const rootB = cuf.find(target.idx);
      if (rootA === rootB) return;
      const headsA = headsInGroup(rootA);
      const headsB = headsInGroup(rootB);
      if (headsA.length > 0 && headsB.length > 0) {
        errors.push(
          `Coaching conflict: ${c.name} wants to coach with ${target.name}, but that would combine Team ${
            headTeamIdx[headsA[0].idx] + 1
          } (${headsA[0].name}) and Team ${headTeamIdx[headsB[0].idx] + 1} (${
            headsB[0].name
          }) into one team — that isn't possible, so this request could not be honored.`
        );
        return;
      }
      cuf.union(c.idx, target.idx);
    });
  });

  // group coaches by their final union-find root
  const coachGroups = {};
  coaches.forEach((c) => {
    const r = cuf.find(c.idx);
    if (!coachGroups[r]) coachGroups[r] = [];
    coachGroups[r].push(c);
  });

  // assign each group to a team: anchored to its head coach if it has one,
  // otherwise held aside as "floating" (assistants who never connected to a
  // head coach through a request) and distributed evenly further down
  const coachFinalTeam = {}; // coach.idx -> team index
  const floatingGroups = [];
  Object.values(coachGroups).forEach((group) => {
    const heads = group.filter(isHead);
    if (heads.length === 0) {
      floatingGroups.push(group);
    } else {
      const ti = headTeamIdx[heads[0].idx];
      group.forEach((c) => {
        coachFinalTeam[c.idx] = ti;
      });
    }
  });

  // distribute floating assistant groups round-robin onto whichever team
  // currently has the fewest assistants, so they don't all pile onto one team
  if (teamCount > 0) {
    const assistantCountPerTeam = Array(teamCount).fill(0);
    Object.entries(coachFinalTeam).forEach(([idx, ti]) => {
      if (!isHead(coaches[idx])) assistantCountPerTeam[ti]++;
    });
    floatingGroups
      .sort((a, b) => b.length - a.length)
      .forEach((group) => {
        let best = 0;
        for (let i = 1; i < teamCount; i++) {
          if (assistantCountPerTeam[i] < assistantCountPerTeam[best]) best = i;
        }
        group.forEach((c) => {
          coachFinalTeam[c.idx] = best;
        });
        assistantCountPerTeam[best] += group.length;
      });
  }

  // ---- player index ----
  const byName = {};
  players.forEach((p) => {
    if (p.name) byName[key(p.name)] = p;
  });

  // ---- union-find for siblings ----
  const uf = new UF(players.length);
  players.forEach((p) => {
    if (key(p.teammateReason) === "sibling" && p.teammateRequest) {
      const target = byName[key(p.teammateRequest)];
      if (target) uf.union(p.idx, target.idx);
      else
        warnings.push(
          `${p.name}'s sibling request "${p.teammateRequest}" was not found in the player list.`
        );
    }
  });

  // ---- avoid pairs ----
  const avoidPairs = [];
  players.forEach((p) => {
    if (key(p.teammateReason) === "avoid" && p.teammateRequest) {
      const target = byName[key(p.teammateRequest)];
      if (target) {
        if (uf.find(p.idx) === uf.find(target.idx)) {
          errors.push(
            `Contradiction: ${p.name} requests to avoid ${target.name}, but they are linked as siblings (directly or through a chain). The sibling link was kept; the avoid request could not be honored.`
          );
        } else {
          avoidPairs.push([uf.find(p.idx), uf.find(target.idx)]);
        }
      } else {
        warnings.push(
          `${p.name}'s avoid request "${p.teammateRequest}" was not found in the player list.`
        );
      }
    }
  });

  // ---- build units from union-find groups ----
  const groups = {};
  players.forEach((p) => {
    const r = uf.find(p.idx);
    if (!groups[r]) groups[r] = [];
    groups[r].push(p);
  });

  const units = Object.entries(groups).map(([root, members]) => {
    const u = {
      id: root,
      members,
      names: members.map((m) => m.name),
      goalieCount: members.filter((m) => key(m.position) === "goalie").length,
      goalieRatingSum: members
        .filter((m) => key(m.position) === "goalie")
        .reduce((s, m) => s + (m.rating || 0), 0),
      forwardCount: members.filter((m) => key(m.position) === "forward").length,
      defenseCount: members.filter((m) => key(m.position) === "defense").length,
      femaleCount: members.filter((m) => key(m.gender) === "female").length,
      // high/low rated SKATERS only — goalies are balanced separately by their own pass
      highRatedCount: members.filter((m) => key(m.position) !== "goalie" && m.rating >= 4).length,
      lowRatedCount: members.filter((m) => key(m.position) !== "goalie" && m.rating < 2).length,
      ratingSum: members.reduce((s, m) => s + (m.rating || 0), 0),
      forwardRatingSum: members
        .filter((m) => key(m.position) === "forward")
        .reduce((s, m) => s + (m.rating || 0), 0),
      defenseRatingSum: members
        .filter((m) => key(m.position) === "defense")
        .reduce((s, m) => s + (m.rating || 0), 0),
      birthYears: {},
      lockedTeam: null,
    };
    members.forEach((m) => {
      u.birthYears[m.birthYear] = (u.birthYears[m.birthYear] || 0) + 1;
    });
    return u;
  });
  const unitByPlayerIdx = {};
  units.forEach((u) => u.members.forEach((m) => (unitByPlayerIdx[m.idx] = u)));

  // ---- lock units to coaches via children ----
  // uses each coach's RESOLVED team (head coaches: their own team; assistants:
  // wherever their coaching request landed them), so an assistant's child ends
  // up on the assistant's actual team, not wherever they were originally listed
  coaches.forEach((c) => {
    const ti = isHead(c) ? headTeamIdx[c.idx] : coachFinalTeam[c.idx];
    if (ti === undefined) return;
    c.childNames.forEach((childName) => {
      const p = byName[key(childName)];
      if (!p) {
        warnings.push(
          `Coach ${c.name}'s listed child "${childName}" was not found in the player list.`
        );
        return;
      }
      const u = unitByPlayerIdx[p.idx];
      p.isCoachChild = true;
      if (u.lockedTeam !== null && u.lockedTeam !== ti) {
        errors.push(
          `Conflict: the group containing ${u.names.join(
            ", "
          )} is required on both Team ${u.lockedTeam + 1} (${
            teamHeadName[u.lockedTeam]
          }) and Team ${ti + 1} (${c.name}) due to sibling/child links. Kept on Team ${
            u.lockedTeam + 1
          }.`
        );
      } else {
        u.lockedTeam = ti;
      }
    });
  });

  // ---- lookup of unit by root id (string keys from Object.entries), used for avoid pairs ----
  const unitByRoot = {};
  units.forEach((u) => (unitByRoot[u.id] = u));
  const avoidUnitPairs = avoidPairs
    .map(([ra, rb]) => [unitByRoot[ra], unitByRoot[rb]])
    .filter(([a, b]) => a && b);

  avoidUnitPairs.forEach(([a, b]) => {
    if (a.lockedTeam !== null && a.lockedTeam === b.lockedTeam) {
      errors.push(
        `Unavoidable conflict: ${a.names.join(", ")} and ${b.names.join(
          ", "
        )} have an "Avoid" request between them, but coach/child assignments force them onto the same team (Team ${
          a.lockedTeam + 1
        }).`
      );
    }
  });

  // ---- roster capacity sanity check ----
  const totalGoalies = units.reduce((s, u) => s + u.goalieCount, 0);
  const totalSkaters = units.reduce((s, u) => s + u.forwardCount + u.defenseCount, 0);
  if (totalGoalies > teamCount * 2 || totalGoalies < teamCount * 1) {
    warnings.push(
      `${totalGoalies} goalies across ${teamCount} teams doesn't evenly satisfy 1-2 per team — some teams may end up short or over.`
    );
  }
  if (totalSkaters > teamCount * 17) {
    errors.push(
      `${totalSkaters} skaters exceed the maximum capacity of ${teamCount * 17} (${teamCount} teams x 17). Some players will not be placed.`
    );
  }

  // ---- initialize team accumulators ----
  const teams = Array.from({ length: teamCount }, (_, i) => ({
    index: i,
    coach: teamHeadName[i],
    assistants: [],
    goalieCount: 0,
    goalieRatingSum: 0,
    forwardCount: 0,
    defenseCount: 0,
    femaleCount: 0,
    highRatedCount: 0,
    lowRatedCount: 0,
    ratingSum: 0,
    forwardRatingSum: 0,
    defenseRatingSum: 0,
    birthYears: {},
    units: [],
  }));
  coaches.forEach((c) => {
    if (isHead(c)) return;
    const ti = coachFinalTeam[c.idx];
    if (teams[ti]) teams[ti].assistants.push(c.name);
  });

  const GOALIE_CAP = 2;
  const SKATER_CAP = 17;

  function canPlace(team, unit) {
    if (team.goalieCount + unit.goalieCount > GOALIE_CAP) return false;
    if (
      team.forwardCount + team.defenseCount + unit.forwardCount + unit.defenseCount >
      SKATER_CAP
    )
      return false;
    return true;
  }
  function violatesAvoid(team, unit) {
    return avoidUnitPairs.some(
      ([a, b]) =>
        (a === unit && team.units.includes(b)) || (b === unit && team.units.includes(a))
    );
  }
  function placementCost(
    team,
    unit,
    avgOverall,
    avgFwd,
    avgDef,
    idealFwdPerTeam,
    idealDefPerTeam,
    idealHighPerTeam,
    idealLowPerTeam,
    idealByYear
  ) {
    const newSkaters = team.forwardCount + team.defenseCount + unit.forwardCount + unit.defenseCount;
    const newRating = team.ratingSum + unit.ratingSum;
    const newFwdCount = team.forwardCount + unit.forwardCount;
    const newDefCount = team.defenseCount + unit.defenseCount;
    const newFwdRating = team.forwardRatingSum + unit.forwardRatingSum;
    const newDefRating = team.defenseRatingSum + unit.defenseRatingSum;
    const overallAvg = newSkaters ? newRating / newSkaters : 0;
    const fwdAvg = newFwdCount ? newFwdRating / newFwdCount : 0;
    const defAvg = newDefCount ? newDefRating / newDefCount : 0;
    let cost =
      Math.abs(overallAvg - avgOverall) * 2 +
      Math.abs(fwdAvg - avgFwd) +
      Math.abs(defAvg - avgDef);
    // keep the number of forwards and defense per team close to the target —
    // weighted heavily so count balance wins out over small rating differences
    cost += Math.abs(newFwdCount - idealFwdPerTeam) * 4;
    cost += Math.abs(newDefCount - idealDefPerTeam) * 4;
    // spread out top-rated (4+) and bottom-rated (<2) skaters instead of letting
    // them cluster on the same team
    const newHigh = team.highRatedCount + unit.highRatedCount;
    const newLow = team.lowRatedCount + unit.lowRatedCount;
    cost += Math.abs(newHigh - idealHighPerTeam) * 3;
    cost += Math.abs(newLow - idealLowPerTeam) * 3;
    // keep each birth year's count per team close to its target — works for
    // any set of birth years present in the data, not just a fixed pair
    Object.keys(idealByYear).forEach((y) => {
      const newYearCount = (team.birthYears[y] || 0) + (unit.birthYears[y] || 0);
      cost += Math.abs(newYearCount - idealByYear[y]) * 1.5;
    });
    const newFemale = team.femaleCount + unit.femaleCount;
    if (newFemale === 1) cost += 8; // heavy penalty for stranding a single female
    return cost;
  }

  function place(team, unit) {
    team.goalieCount += unit.goalieCount;
    team.goalieRatingSum += unit.goalieRatingSum;
    team.forwardCount += unit.forwardCount;
    team.defenseCount += unit.defenseCount;
    team.femaleCount += unit.femaleCount;
    team.highRatedCount += unit.highRatedCount;
    team.lowRatedCount += unit.lowRatedCount;
    team.ratingSum += unit.ratingSum;
    team.forwardRatingSum += unit.forwardRatingSum;
    team.defenseRatingSum += unit.defenseRatingSum;
    Object.keys(unit.birthYears).forEach((y) => {
      team.birthYears[y] = (team.birthYears[y] || 0) + unit.birthYears[y];
    });
    team.units.push(unit);
  }

  const unplaced = [];

  // locked units first
  units
    .filter((u) => u.lockedTeam !== null)
    .sort((a, b) => b.members.length - a.members.length)
    .forEach((u) => {
      const team = teams[u.lockedTeam];
      if (!team) {
        unplaced.push(u);
        return;
      }
      if (!canPlace(team, u)) {
        errors.push(
          `Team ${u.lockedTeam + 1} (${team.coach}) exceeds roster caps because of required placements (${u.names.join(
            ", "
          )}). Placed anyway — review roster manually.`
        );
      }
      place(team, u);
    });

  // remaining movable units, biggest/most constrained first
  const stillMovable = units.filter((u) => u.lockedTeam === null);

  // ---- goalies get their own placement pass first, so every team reaches 1-2 before ----
  // ---- skater balancing (otherwise goalies get swept up arbitrarily among skaters) ----
  const movableGoalieUnits = stillMovable
    .filter((u) => u.goalieCount > 0)
    .sort((a, b) => b.goalieCount - a.goalieCount || b.ratingSum - a.ratingSum);

  movableGoalieUnits.forEach((u) => {
    let candidates = teams.filter((t) => canPlace(t, u) && !violatesAvoid(t, u));
    if (candidates.length === 0) {
      candidates = teams.filter((t) => !violatesAvoid(t, u));
      if (candidates.length === 0) candidates = teams;
      errors.push(
        `Could not find a team for goalie(s) ${u.names.join(
          ", "
        )} within the 1-2 goalie cap or without breaking an avoid request. Placed on the least-bad team — please review.`
      );
    }
    // prefer teams with the fewest goalies so far (so every team reaches at least 1
    // before any team gets a 2nd), then balance goalie rating between teams
    let best = candidates[0];
    let bestCost = Infinity;
    candidates.forEach((t) => {
      const currentAvg = t.goalieCount ? t.goalieRatingSum / t.goalieCount : 0;
      const newAvg = (t.goalieRatingSum + u.ratingSum) / (t.goalieCount + u.goalieCount);
      const cost = t.goalieCount * 100 + Math.abs(newAvg - currentAvg);
      if (cost < bestCost) {
        bestCost = cost;
        best = t;
      }
    });
    place(best, u);
  });

  const movable = stillMovable
    .filter((u) => u.goalieCount === 0)
    .sort((a, b) => b.members.length - a.members.length || b.ratingSum - a.ratingSum);

  // target forward/defense counts per team, based on the full roster (including
  // locked units), so movable placement steadily works toward an even split
  const totalForwardsAll = units.reduce((s, u) => s + u.forwardCount, 0);
  const totalDefenseAll = units.reduce((s, u) => s + u.defenseCount, 0);
  const idealFwdPerTeam = totalForwardsAll / teamCount;
  const idealDefPerTeam = totalDefenseAll / teamCount;
  // same idea for top-rated (4+) and bottom-rated (<2) skaters, so they get
  // spread across teams instead of clustering
  const totalHighAll = units.reduce((s, u) => s + u.highRatedCount, 0);
  const totalLowAll = units.reduce((s, u) => s + u.lowRatedCount, 0);
  const idealHighPerTeam = totalHighAll / teamCount;
  const idealLowPerTeam = totalLowAll / teamCount;
  // same idea for birth year — works for any years present in the data (not
  // just a fixed pair), so this works the same for a 2014/2015 division as
  // it would for a 2016/2017 division, or any other set of birth years
  const allBirthYears = [...new Set(units.flatMap((u) => Object.keys(u.birthYears)))];
  const idealByYear = {};
  allBirthYears.forEach((y) => {
    const totalForYear = units.reduce((s, u) => s + (u.birthYears[y] || 0), 0);
    idealByYear[y] = totalForYear / teamCount;
  });

  movable.forEach((u) => {
    const totalRatingSum = teams.reduce((s, t) => s + t.ratingSum, 0);
    const totalSkatersNow = teams.reduce((s, t) => s + t.forwardCount + t.defenseCount, 0) || 1;
    const avgOverall = totalRatingSum / totalSkatersNow;
    const totalFwd = teams.reduce((s, t) => s + t.forwardCount, 0) || 1;
    const totalFwdRating = teams.reduce((s, t) => s + t.forwardRatingSum, 0);
    const avgFwd = totalFwdRating / totalFwd;
    const totalDef = teams.reduce((s, t) => s + t.defenseCount, 0) || 1;
    const totalDefRating = teams.reduce((s, t) => s + t.defenseRatingSum, 0);
    const avgDef = totalDefRating / totalDef;

    let candidates = teams.filter((t) => canPlace(t, u) && !violatesAvoid(t, u));
    if (candidates.length === 0) {
      // relax capacity if truly nothing fits (avoid constraints still respected if possible)
      candidates = teams.filter((t) => !violatesAvoid(t, u));
      if (candidates.length === 0) candidates = teams;
      errors.push(
        `Could not find a team for ${u.names.join(
          ", "
        )} without breaking roster caps or an avoid request. Placed on the least-bad team — please review.`
      );
    }
    let best = candidates[0];
    let bestCost = Infinity;
    candidates.forEach((t) => {
      const c = placementCost(
        t,
        u,
        avgOverall,
        avgFwd,
        avgDef,
        idealFwdPerTeam,
        idealDefPerTeam,
        idealHighPerTeam,
        idealLowPerTeam,
        idealByYear
      );
      if (c < bestCost) {
        bestCost = c;
        best = t;
      }
    });
    place(best, u);
  });

  // ---- local search swap improvement ----
  function totalImbalance() {
    const skaterCounts = teams.map((t) => t.forwardCount + t.defenseCount);
    const overallAvgs = teams.map((t, i) => (skaterCounts[i] ? t.ratingSum / skaterCounts[i] : 0));
    const fwdAvgs = teams.map((t) => (t.forwardCount ? t.forwardRatingSum / t.forwardCount : 0));
    const defAvgs = teams.map((t) => (t.defenseCount ? t.defenseRatingSum / t.defenseCount : 0));
    const fwdCounts = teams.map((t) => t.forwardCount);
    const defCounts = teams.map((t) => t.defenseCount);
    const highCounts = teams.map((t) => t.highRatedCount);
    const lowCounts = teams.map((t) => t.lowRatedCount);
    const spread = (arr) => Math.max(...arr) - Math.min(...arr);
    let score =
      spread(overallAvgs) * 2 +
      spread(fwdAvgs) +
      spread(defAvgs) +
      spread(fwdCounts) * 4 +
      spread(defCounts) * 4 +
      spread(highCounts) * 3 +
      spread(lowCounts) * 3;
    // works for any set of birth years present in the data, not just a fixed pair
    allBirthYears.forEach((y) => {
      const counts = teams.map((t) => t.birthYears[y] || 0);
      score += spread(counts) * 1.5;
    });
    teams.forEach((t) => {
      if (t.femaleCount === 1) score += 8;
      if (t.goalieCount === 0) score += 20;
    });
    return score;
  }

  const movableUnits = units.filter((u) => u.lockedTeam === null);
  let improved = true;
  let passes = 0;
  while (improved && passes < 4) {
    improved = false;
    passes++;
    for (let i = 0; i < movableUnits.length; i++) {
      for (let j = i + 1; j < movableUnits.length; j++) {
        const ua = movableUnits[i];
        const ub = movableUnits[j];
        const ta = teams.find((t) => t.units.includes(ua));
        const tb = teams.find((t) => t.units.includes(ub));
        if (ta === tb) continue;
        // simulate swap capacity check
        const taGoalieAfter = ta.goalieCount - ua.goalieCount + ub.goalieCount;
        const taSkaterAfter =
          ta.forwardCount + ta.defenseCount - (ua.forwardCount + ua.defenseCount) + (ub.forwardCount + ub.defenseCount);
        const tbGoalieAfter = tb.goalieCount - ub.goalieCount + ua.goalieCount;
        const tbSkaterAfter =
          tb.forwardCount + tb.defenseCount - (ub.forwardCount + ub.defenseCount) + (ua.forwardCount + ua.defenseCount);
        if (taGoalieAfter > GOALIE_CAP || tbGoalieAfter > GOALIE_CAP) continue;
        if (taSkaterAfter > SKATER_CAP || tbSkaterAfter > SKATER_CAP) continue;
        if (taGoalieAfter < 0 || tbGoalieAfter < 0) continue;
        // never let a swap strand a team at 0 goalies if it currently has one
        if ((taGoalieAfter === 0 && ta.goalieCount > 0) || (tbGoalieAfter === 0 && tb.goalieCount > 0))
          continue;
        // rebuild post-swap unit sets and check avoid pairs touching ta/tb
        const taUnitsAfter = ta.units.filter((x) => x !== ua).concat(ub);
        const tbUnitsAfter = tb.units.filter((x) => x !== ub).concat(ua);
        const avoidBroken = avoidUnitPairs.some(
          ([a, b]) =>
            (taUnitsAfter.includes(a) && taUnitsAfter.includes(b)) ||
            (tbUnitsAfter.includes(a) && tbUnitsAfter.includes(b))
        );
        if (avoidBroken) continue;

        const before = totalImbalance();
        // remove both, re-place both (simplest correct way given accumulator sums)
        function removeUnit(team, u) {
          team.goalieCount -= u.goalieCount;
          team.goalieRatingSum -= u.goalieRatingSum;
          team.forwardCount -= u.forwardCount;
          team.defenseCount -= u.defenseCount;
          team.femaleCount -= u.femaleCount;
          team.highRatedCount -= u.highRatedCount;
          team.lowRatedCount -= u.lowRatedCount;
          team.ratingSum -= u.ratingSum;
          team.forwardRatingSum -= u.forwardRatingSum;
          team.defenseRatingSum -= u.defenseRatingSum;
          Object.keys(u.birthYears).forEach((y) => (team.birthYears[y] -= u.birthYears[y]));
          team.units = team.units.filter((x) => x !== u);
        }
        removeUnit(ta, ua);
        removeUnit(tb, ub);
        place(ta, ub);
        place(tb, ua);
        const after = totalImbalance();
        if (after < before - 0.0001) {
          improved = true;
        } else {
          // revert
          removeUnit(ta, ub);
          removeUnit(tb, ua);
          place(ta, ua);
          place(tb, ub);
        }
      }
    }
  }

  // final checks
  teams.forEach((t) => {
    if (t.goalieCount === 0) {
      errors.push(
        `Team ${t.index + 1} (${t.coach}) has 0 goalies. There may not be enough goalies to give every team at least one — check your goalie count against the number of teams.`
      );
    } else if (t.goalieCount > 2) {
      errors.push(
        `Team ${t.index + 1} (${t.coach}) has ${t.goalieCount} goalies, above the cap of 2.`
      );
    }
  });
  teams.forEach((t) => {
    if (t.femaleCount === 1) {
      errors.push(
        `Team ${t.index + 1} (${t.coach}) has exactly 1 female player and could not be rebalanced without breaking a coach/sibling/avoid requirement. Needs manual review.`
      );
    }
  });

  // ---- teammate request fulfillment report ----
  // Sibling/Avoid are hard constraints, so any failure there is already a hard
  // error above — this section shows the outcome for every request type
  // (including those) so people can see at a glance who ended up where relative
  // to who they asked for, with Transportation/Friend being best-effort only.
  const playerTeamIndex = {};
  teams.forEach((t) => {
    t.units.forEach((u) => {
      u.members.forEach((m) => {
        playerTeamIndex[m.idx] = t.index;
      });
    });
  });
  const fulfilledRequests = [];
  const unfulfilledRequests = [];
  players.forEach((p) => {
    const reason = key(p.teammateReason);
    const isAvoid = reason === "avoid";
    if ((reason === "sibling" || reason === "avoid" || reason === "transportation" || reason === "friend") && p.teammateRequest) {
      const target = byName[key(p.teammateRequest)];
      if (!target) return; // already flagged in warnings as a name-not-found issue
      const sameTeam = playerTeamIndex[p.idx] === playerTeamIndex[target.idx];
      // for Avoid, "fulfilled" means they were kept APART, not together
      const honored = isAvoid ? !sameTeam : sameTeam;
      p.requestFulfilled = honored;
      const entry = {
        name: p.name,
        request: p.teammateRequest,
        reason: p.teammateReason,
        playerTeam: playerTeamIndex[p.idx],
        targetTeam: playerTeamIndex[target.idx],
      };
      if (honored) fulfilledRequests.push(entry);
      else unfulfilledRequests.push(entry);
    }
  });

  return { teams, errors, warnings, unplaced, fulfilledRequests, unfulfilledRequests };
}

// ---------- shared file download helper ----------
function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- CSV export ----------
function exportCSV(teams) {
  const rows = [
    [
      "Team",
      "Coach",
      "Assistants",
      "Name",
      "Position",
      "Year of Birth",
      "Rating",
      "Gender",
      "Coach's Child",
      "Teammate Request",
      "Teammate Reason",
      "Teammate Request Fulfilled",
    ],
  ];
  teams.forEach((t) => {
    t.units.forEach((u) => {
      u.members.forEach((m) => {
        const hasRequest = !!m.teammateRequest;
        rows.push([
          t.index + 1,
          t.coach,
          t.assistants.join(" / "),
          m.name,
          m.position,
          m.birthYear,
          m.rating,
          m.gender,
          m.isCoachChild ? "Yes" : "",
          m.teammateRequest || "",
          m.teammateReason || "",
          hasRequest ? (m.requestFulfilled ? "Yes" : "No") : "",
        ]);
      });
    });
  });
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadTextFile("team_rosters.csv", csv);
}

// ---------- UI ----------
function FileDrop({ label, hint, onText, filename }) {
  const ref = useRef();
  return (
    <div className="fileDrop">
      <div className="fileDrop-label">{label}</div>
      <div className="fileDrop-hint">{hint}</div>
      <input
        ref={ref}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = (ev) => onText(ev.target.result, f.name);
          reader.readAsText(f);
        }}
      />
      <button className="btn btn-ghost" onClick={() => ref.current.click()}>
        {filename ? "Change file" : "Choose CSV"}
      </button>
      {filename && <div className="fileDrop-name">✓ {filename}</div>}
    </div>
  );
}

function StatBar({ label, value, max, suffix }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="statBar">
      <div className="statBar-row">
        <span>{label}</span>
        <span className="statBar-val">
          {value}
          {suffix || ""}
        </span>
      </div>
      <div className="statBar-track">
        <div className="statBar-fill" style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}

export default function TeamBalancer() {
  const [playersText, setPlayersText] = useState(null);
  const [playersFilename, setPlayersFilename] = useState(null);
  const [coachesText, setCoachesText] = useState(null);
  const [coachesFilename, setCoachesFilename] = useState(null);
  const [numTeams, setNumTeams] = useState(6);
  const [result, setResult] = useState(null);
  const [ran, setRan] = useState(false);
  const [mockPlayerCount, setMockPlayerCount] = useState(100);
  const [mockData, setMockData] = useState(null);

  const generateMock = () => {
    const n = Math.max(20, Math.min(200, parseInt(mockPlayerCount, 10) || 100));
    setMockPlayerCount(n);
    setMockData(generateMockData(n));
  };

  const loadMockIntoApp = () => {
    if (!mockData) return;
    setPlayersText(mockData.playersCSV);
    setPlayersFilename(`players_mock_${mockData.totalPlayers}.csv (generated)`);
    setCoachesText(mockData.coachesCSV);
    setCoachesFilename(`coaches_mock_${mockData.totalPlayers}.csv (generated)`);
    setNumTeams(mockData.teamCount);
    setResult(null);
    setRan(false);
  };

  const canRun = playersText && coachesText;

  const runBuild = () => {
    const players = loadPlayers(playersText);
    const coaches = loadCoaches(coachesText);
    const r = buildTeams(players, coaches, parseInt(numTeams, 10));
    setResult(r);
    setRan(true);
  };

  const jerseyColors = [
    "#1D4E89",
    "#C8102E",
    "#1B7A43",
    "#6A3FA0",
    "#B8860B",
    "#0E7C86",
    "#8C4A2F",
    "#4B4B4B",
  ];

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Barlow+Condensed:wght@500;600;700&family=Roboto+Mono:wght@500&display=swap');
        :root {
          --ice: #F4F8FB;
          --rink-navy: #0B1D3A;
          --rink-navy-2: #12294F;
          --line-red: #C8102E;
          --whistle: #F2B705;
          --ink: #16202E;
          --muted: #5B6B80;
          --card: #FFFFFF;
          --border: #DCE4EC;
        }
        * { box-sizing: border-box; }
        .app {
          font-family: 'Barlow Condensed', sans-serif;
          background: var(--ice);
          color: var(--ink);
          min-height: 100%;
          padding: 0 0 48px 0;
        }
        .hero {
          background: linear-gradient(160deg, var(--rink-navy) 0%, var(--rink-navy-2) 65%);
          color: white;
          padding: 40px 32px 56px;
          position: relative;
          overflow: hidden;
        }
        .hero::after {
          content: "";
          position: absolute;
          left: -10%; right: -10%; bottom: -60px;
          height: 120px;
          border-top: 3px solid rgba(200,16,46,0.55);
          border-radius: 50%;
        }
        .hero-eyebrow {
          font-family: 'Roboto Mono', monospace;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-size: 12px;
          color: var(--whistle);
        }
        .hero h1 {
          font-family: 'Archivo Black', sans-serif;
          font-size: 40px;
          margin: 8px 0 6px;
          line-height: 1.05;
        }
        .hero p { color: #C7D3E3; max-width: 640px; font-size: 18px; margin: 0; }
        .section {
          max-width: 1080px;
          margin: -28px auto 0;
          padding: 0 32px;
          position: relative;
          z-index: 2;
        }
        .panel {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 24px;
          box-shadow: 0 12px 30px rgba(11,29,58,0.08);
        }
        .panel + .panel { margin-top: 24px; }
        .panel h2 {
          font-family: 'Archivo Black', sans-serif;
          font-size: 18px;
          margin: 0 0 4px;
        }
        .panel .sub { color: var(--muted); font-size: 15px; margin: 0 0 18px; }
        .fileRow { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 16px; }
        .sampleBox {
          background: #F7FAFD;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 16px 18px;
          margin-bottom: 20px;
        }
        .sampleBox-label {
          font-family: 'Archivo Black', sans-serif;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--rink-navy);
          margin-bottom: 6px;
        }
        .sampleBox-hint { font-size: 14px; color: var(--muted); margin: 0 0 12px; }
        .sampleBox-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .sampleSelect {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 15px;
          padding: 9px 10px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: white;
          min-width: 230px;
        }
        .sampleBox-detail { font-size: 13px; color: var(--muted); margin: 10px 0 0; font-family: 'Roboto Mono', monospace; }
        .fileDrop {
          border: 1px dashed var(--border);
          border-radius: 8px;
          padding: 16px;
          background: #FAFCFE;
        }
        .fileDrop-label { font-weight: 600; font-size: 16px; }
        .fileDrop-hint { color: var(--muted); font-size: 13px; margin: 2px 0 10px; }
        .fileDrop-name { margin-top: 8px; font-size: 13px; color: #1B7A43; font-weight: 600; }
        .btn {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 600;
          font-size: 15px;
          border-radius: 6px;
          padding: 10px 18px;
          border: none;
          cursor: pointer;
          letter-spacing: 0.01em;
        }
        .btn-primary { background: var(--line-red); color: white; }
        .btn-primary:disabled { background: #E3AEB5; cursor: not-allowed; }
        .btn-ghost { background: var(--rink-navy); color: white; }
        .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--ink); }
        .controlsRow { display: flex; align-items: flex-end; gap: 20px; flex-wrap: wrap; margin-top: 20px; }
        .numInput label { display:block; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
        .numInput input {
          font-family: 'Roboto Mono', monospace;
          font-size: 18px;
          width: 90px;
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: 6px;
        }
        .errorBox, .warnBox {
          border-radius: 8px;
          padding: 16px 18px;
          margin-bottom: 14px;
        }
        .errorBox { background: #FDEDEF; border: 1px solid #F3C1C9; }
        .warnBox { background: #FFF8E6; border: 1px solid #F2DFA0; }
        .noteBox { background: #EEF4FB; border: 1px solid #C6DCF0; border-radius: 8px; padding: 16px 18px; margin-bottom: 14px; }
        .noteBox h3 {
          font-family: 'Archivo Black', sans-serif;
          font-size: 14px;
          margin: 0 0 8px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--rink-navy);
        }
        .noteBox-summary { margin: 0 0 8px; font-size: 15px; color: var(--muted); }
        .noteBox ul { margin: 0; padding-left: 18px; font-size: 15px; line-height: 1.5; }
        .errorBox h3, .warnBox h3 {
          font-family: 'Archivo Black', sans-serif;
          font-size: 14px;
          margin: 0 0 8px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .errorBox h3 { color: var(--line-red); }
        .warnBox h3 { color: #8A6D00; }
        .errorBox ul, .warnBox ul { margin: 0; padding-left: 18px; font-size: 15px; line-height: 1.5; }
        .teamsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }
        .teamCard {
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border);
          background: var(--card);
        }
        .teamCard-head {
          padding: 14px 16px;
          color: white;
        }
        .teamCard-num {
          font-family: 'Roboto Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.12em;
          opacity: 0.85;
          text-transform: uppercase;
        }
        .teamCard-coach {
          font-family: 'Archivo Black', sans-serif;
          font-size: 20px;
          margin-top: 2px;
        }
        .teamCard-assist { font-size: 13px; opacity: 0.9; margin-top: 4px; }
        .teamCard-body { padding: 16px; }
        .statBar { margin-bottom: 10px; }
        .statBar-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); margin-bottom: 3px; }
        .statBar-val { font-family: 'Roboto Mono', monospace; color: var(--ink); font-weight: 600; }
        .statBar-track { height: 6px; background: #EEF2F6; border-radius: 4px; overflow: hidden; }
        .statBar-fill { height: 100%; background: var(--rink-navy); }
        .rosterList { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; max-height: 220px; overflow-y: auto; }
        .rosterRow { display: flex; justify-content: space-between; font-size: 14px; padding: 3px 0; }
        .rosterRow .pos { color: var(--muted); font-family: 'Roboto Mono', monospace; font-size: 11px; }
        .footerActions { display: flex; gap: 12px; margin-top: 24px; }
        .emptyState { text-align: center; padding: 40px 20px; color: var(--muted); }
        .howPanel summary {
          cursor: pointer;
          font-weight: 600;
          font-size: 16px;
          color: var(--rink-navy);
          padding: 6px 0;
        }
        .howPanel summary:hover { color: var(--line-red); }
        .howBody { margin-top: 12px; font-size: 15px; line-height: 1.55; color: var(--ink); }
        .howBody p { margin: 0 0 12px; }
        .priorityList {
          margin: 0 0 14px;
          padding-left: 22px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .priorityList li { padding-left: 4px; }
      `}</style>

      <div className="hero">
        <div className="hero-eyebrow">Season Roster Builder</div>
        <h1>Balance the Bench</h1>
        <p>
          Upload your player and coach spreadsheets, set the number of teams, and let the builder
          match coaches who want to work together, honor siblings and avoid pairs first — then
          balance strength, position, birth year, and pairing rules as closely as possible around
          them.
        </p>
      </div>

      <div className="section">
        <div className="panel howPanel">
          <h2>What this is</h2>
          <p className="sub" style={{ marginBottom: 16 }}>
            This tool splits a full season's registration list into balanced teams for your
            coaches. Upload a players spreadsheet and a coaches spreadsheet, tell it how many
            teams you're forming, and it assigns every player to a team — honoring the requests
            that matter most, then balancing everything else as evenly as it can around them.
          </p>
          <details>
            <summary>How team assignments are prioritized</summary>
            <div className="howBody">
              <p>
                Requests are honored in this order. The first three are treated as{" "}
                <strong>hard requirements</strong> — the app will not break them to improve
                balance, and will show an error if they can't all be satisfied at once (e.g. a
                chain of coaching requests that would merge two different teams). The last two are{" "}
                <strong>best effort</strong> — honored whenever possible, but sacrificed first if
                honoring them would force a team badly out of balance.
              </p>
              <ol className="priorityList">
                <li>
                  <strong>Coaches who want to coach together</strong> — any coach (head or
                  assistant) can list up to 3 other coaches they want to work with. They're grouped
                  onto the same team whenever possible. Groups anchor to whichever head coach is in
                  them; a request that would combine two different head coaches' teams can't be
                  honored and is reported as an error instead. Assistants with no successful
                  request are spread evenly across teams.
                </li>
                <li>
                  <strong>Sibling requests</strong> (Teammate Reason = Sibling) — always kept
                  together. A coach's own listed children are treated the same way, automatically
                  locked to whichever team that coach ends up on.
                </li>
                <li>
                  <strong>Avoid requests</strong> (Teammate Reason = Avoid) — always kept apart.
                </li>
                <li>
                  <strong>Transportation requests</strong> (Teammate Reason = Transportation) —
                  kept together when it doesn't cost too much balance.
                </li>
                <li>
                  <strong>Friend requests</strong> (Teammate Reason = Friend) — same as
                  Transportation, lowest priority.
                </li>
              </ol>
              <p>
                After requests are placed, the app balances everything else it can: the number of
                forwards and defense per team, overall skater rating per team, birth-year split,
                how many top-rated (4+) and lower-rated (under 2) skaters land on each team, 1–2
                goalies per team, and making sure no team ends up with exactly one female player
                (every team has either zero or at least two). The results screen shows exactly
                which requests couldn't be honored and why, so nothing is a silent trade-off.
              </p>
            </div>
          </details>
        </div>

        <div className="panel">
          <h2>1. Upload rosters</h2>
          <p className="sub">
            Players CSV needs: Name, Year of Birth, Rating, Gender, Position (Goalie / Forward /
            Defense), Teammate Request, Teammate Reason. Coaches CSV needs: Coach, Role (Head or
            Assistant — one row per coach, head or assistant), Coach Request 1–3 (up to 3 other
            coaches this person wants to coach with), Childs Names. Coach Request and Childs Names
            can be left blank.
          </p>

          <div className="sampleBox">
            <div className="sampleBox-label">Sample data</div>
            <p className="sampleBox-hint">
              Not sure of the format, or just want to try the app first? Pick how many players you
              want (up to 200) and generate a mock roster sized to match — the team count is worked
              out automatically so it always fits the app's roster caps.
            </p>
            <div className="sampleBox-row">
              <input
                type="number"
                className="sampleSelect"
                style={{ minWidth: 140 }}
                min="20"
                max="200"
                value={mockPlayerCount}
                onChange={(e) => setMockPlayerCount(e.target.value)}
              />
              <span style={{ fontSize: 14, color: "var(--muted)" }}>players (max 200)</span>
              <button className="btn btn-primary" onClick={generateMock}>
                Generate sample data
              </button>
            </div>
            {mockData && (
              <>
                <p className="sampleBox-detail">
                  {mockData.totalPlayers} total players ({mockData.goalieCount} goalies,{" "}
                  {mockData.skaterCount} skaters) across {mockData.teamCount} teams · birth years{" "}
                  {mockData.birthYears.join(" / ")}
                </p>
                <div className="sampleBox-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={loadMockIntoApp}>
                    Load into app
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() =>
                      downloadTextFile(`players_mock_${mockData.totalPlayers}.csv`, mockData.playersCSV)
                    }
                  >
                    Download players CSV
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() =>
                      downloadTextFile(`coaches_mock_${mockData.totalPlayers}.csv`, mockData.coachesCSV)
                    }
                  >
                    Download coaches CSV
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="fileRow">
            <FileDrop
              label="Players CSV"
              hint="Required"
              filename={playersFilename}
              onText={(t, n) => {
                setPlayersText(t);
                setPlayersFilename(n);
              }}
            />
            <FileDrop
              label="Coaches CSV"
              hint="Required — assistants already decided"
              filename={coachesFilename}
              onText={(t, n) => {
                setCoachesText(t);
                setCoachesFilename(n);
              }}
            />
          </div>
          <div className="controlsRow">
            <div className="numInput">
              <label>Number of teams</label>
              <input
                type="number"
                min="1"
                value={numTeams}
                onChange={(e) => setNumTeams(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" disabled={!canRun} onClick={runBuild}>
              Generate teams
            </button>
          </div>
        </div>

        {ran && result && (
          <div className="panel">
            <h2>2. Results</h2>
            <p className="sub">
              {result.errors.length === 0
                ? "No unresolved conflicts — coach/assistant pairings, siblings, and avoid requirements were honored."
                : `${result.errors.length} item${
                    result.errors.length > 1 ? "s" : ""
                  } need your attention below.`}
            </p>

            {result.errors.length > 0 && (
              <div className="errorBox">
                <h3>Needs attention</h3>
                <ul>
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.warnings.length > 0 && (
              <div className="warnBox">
                <h3>Warnings</h3>
                <ul>
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {(result.unfulfilledRequests.length > 0 || result.fulfilledRequests.length > 0) && (
              <div className="noteBox">
                <h3>Teammate requests</h3>
                <p className="noteBox-summary">
                  {result.fulfilledRequests.length} of{" "}
                  {result.fulfilledRequests.length + result.unfulfilledRequests.length} honored
                  {result.unfulfilledRequests.length > 0 ? " — the rest are listed below." : "."}
                </p>
                {result.unfulfilledRequests.length > 0 && (
                  <ul>
                    {result.unfulfilledRequests.map((r, i) => {
                      const isAvoid = key(r.reason) === "avoid";
                      const msg = isAvoid
                        ? `wanted to avoid ${r.request}, but both ended up on Team ${r.playerTeam + 1}`
                        : `wanted to be with ${r.request} (${r.reason}) — ended up on Team ${
                            r.playerTeam + 1
                          } vs. Team ${r.targetTeam + 1}`;
                      return (
                        <li key={i}>
                          <strong>{r.name}</strong> {msg}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className="teamsGrid">
              {result.teams.map((t, i) => {
                const skaters = t.forwardCount + t.defenseCount;
                const overallAvg = skaters ? (t.ratingSum / skaters).toFixed(2) : "—";
                const fwdAvg = t.forwardCount ? (t.forwardRatingSum / t.forwardCount).toFixed(2) : "—";
                const defAvg = t.defenseCount ? (t.defenseRatingSum / t.defenseCount).toFixed(2) : "—";
                const color = jerseyColors[i % jerseyColors.length];
                return (
                  <div className="teamCard" key={i}>
                    <div className="teamCard-head" style={{ background: color }}>
                      <div className="teamCard-num">Team {t.index + 1}</div>
                      <div className="teamCard-coach">{t.coach}</div>
                      {t.assistants.length > 0 && (
                        <div className="teamCard-assist">Asst: {t.assistants.join(", ")}</div>
                      )}
                    </div>
                    <div className="teamCard-body">
                      <StatBar label="Goalies" value={t.goalieCount} max={2} />
                      <StatBar label="Forwards" value={t.forwardCount} max={17} />
                      <StatBar label="Defense" value={t.defenseCount} max={17} />
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          fontSize: 13,
                          marginTop: 10,
                          fontFamily: "'Roboto Mono', monospace",
                        }}
                      >
                        <span>Overall avg {overallAvg}</span>
                        <span>Fwd {fwdAvg}</span>
                        <span>Def {defAvg}</span>
                      </div>
                      <div style={{ fontSize: 13, marginTop: 6, color: "var(--muted)" }}>
                        {t.femaleCount} female ·{" "}
                        {Object.keys(t.birthYears)
                          .sort()
                          .map((y) => `'${y.slice(-2)}: ${t.birthYears[y]}`)
                          .join(" · ")}
                      </div>
                      <div style={{ fontSize: 13, marginTop: 2, color: "var(--muted)" }}>
                        4+ rated: {t.highRatedCount} · Under 2 rated: {t.lowRatedCount}
                      </div>
                      <div className="rosterList">
                        {t.units
                          .flatMap((u) => u.members)
                          .sort((a, b) => a.position.localeCompare(b.position) || b.rating - a.rating)
                          .map((m, mi) => (
                            <div className="rosterRow" key={mi}>
                              <span>
                                {m.name}{" "}
                                <span className="pos">{m.position[0]}</span>
                              </span>
                              <span>{m.rating}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="footerActions">
              <button className="btn btn-primary" onClick={() => exportCSV(result.teams)}>
                Export rosters as CSV
              </button>
            </div>
          </div>
        )}

        {!ran && (
          <div className="panel">
            <div className="emptyState">
              Upload your CSVs (or load the sample data) and set your team count to generate
              balanced rosters.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
