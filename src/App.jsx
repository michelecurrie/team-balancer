import React, { useState, useMemo, useRef } from "react";
import Papa from "papaparse";

// ---------- helpers ----------
const norm = (s) => (s || "").toString().trim();
const key = (s) => norm(s).toLowerCase();

// Accepts common real-world spelling/abbreviation variants (e.g. British
// "Defence") and canonicalizes them, instead of silently failing to match a
// single hardcoded spelling. Returns null for anything unrecognized so the
// caller can flag it loudly rather than have that player quietly vanish
// from position-based balancing and the roster cap check.
function normalizePosition(raw) {
  const k = key(raw);
  if (["goalie", "goaltender", "goalkeeper", "g"].includes(k)) return "Goalie";
  if (["forward", "fwd", "f"].includes(k)) return "Forward";
  if (["defense", "defence", "def", "d"].includes(k)) return "Defense";
  return null;
}

// Same idea for coach Role — recognizes common variants and returns null for
// anything unrecognized so it can be flagged instead of silently
// mis-categorized (e.g. a Manager row quietly treated as a floating
// Assistant, which would wrongly count it against the 5-coach cap).
function normalizeRole(raw) {
  const k = key(raw);
  if (["head", "head coach", "hc"].includes(k)) return "Head";
  if (["assistant", "assistant coach", "asst", "asst coach", "a"].includes(k)) return "Assistant";
  if (["manager", "team manager", "mgr"].includes(k)) return "Manager";
  return null;
}

function parseCSV(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: true });
  return res.data.map((row) => {
    const out = {};
    Object.keys(row).forEach((k) => (out[norm(k)] = norm(row[k])));
    return out;
  });
}

function loadPlayers(text) {
  return parseCSV(text).map((r, i) => {
    const normalizedPosition = normalizePosition(r["Position"]);
    const teammateRequests = [1, 2, 3]
      .map((n) => ({
        request: r[`Teammate Request ${n}`],
        reason: r[`Teammate Reason ${n}`],
      }))
      .filter((tr) => tr.request);
    return {
      idx: i,
      name: r["Name"],
      birthYear: parseInt(r["Year of Birth"], 10),
      rating: parseFloat(r["Rating"]),
      gender: r["Gender"],
      // canonicalized when recognized (handles "Defence" etc.); otherwise the
      // raw value is kept as-is so an error message can show exactly what
      // was in the file
      position: normalizedPosition || r["Position"],
      positionRecognized: !!normalizedPosition,
      // up to 3 teammate requests, each with its own reason
      teammateRequests,
    };
  });
}

function loadCoaches(text) {
  return parseCSV(text).map((r, i) => {
    const normalizedRole = normalizeRole(r["Role"]);
    return {
      idx: i,
      name: r["Coach"],
      role: normalizedRole || r["Role"],
      roleRecognized: !!normalizedRole,
      requests: [
        r["Coach Request 1"],
        r["Coach Request 2"],
        r["Coach Request 3"],
      ].filter((x) => x),
      childNames: (r["Childs Names"] || "")
        .split(";")
        .map((s) => norm(s))
        .filter((x) => x),
    };
  });
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

// Blank starting-point templates — just the correct headers plus a couple of
// clearly-marked example rows showing how requests reference another row by
// exact name, for people building their real list from scratch rather than
// exploring with generated data.
const BLANK_PLAYERS_TEMPLATE = [
  "Name,Year of Birth,Rating,Gender,Position,Teammate Request 1,Teammate Reason 1,Teammate Request 2,Teammate Reason 2,Teammate Request 3,Teammate Reason 3",
  "EXAMPLE Jamie Smith,2015,3,Female,Forward,EXAMPLE Alex Smith,Sibling,,,,",
  "EXAMPLE Alex Smith,2015,3,Male,Defense,EXAMPLE Jamie Smith,Sibling,,,,",
  "EXAMPLE Riley Cormier,2015,2,Female,Defense,,,,,,",
  "EXAMPLE Taylor Reid,2015,4,Male,Goalie,,,,,,",
].join("\n");

const BLANK_COACHES_TEMPLATE = [
  "Coach,Role,Coach Request 1,Coach Request 2,Coach Request 3,Childs Names",
  "EXAMPLE Pat Wilson,Head,,,,EXAMPLE Jamie Smith",
  "EXAMPLE Sam Doucet,Assistant,EXAMPLE Pat Wilson,,,",
  "EXAMPLE Robin Furlotte,Manager,EXAMPLE Pat Wilson,,,",
].join("\n");

// picks a team count that's always guaranteed to fit `numPlayers` under the
// app's own roster caps (18 skaters / 1-2 goalies per team), instead of a
// fixed number that might not fit — this is what broke the earlier
// division presets, so the generator works it out itself every time
function computeSafeTeamCount(numPlayers) {
  let teams = Math.max(1, Math.ceil(numPlayers / 18));
  for (let guard = 0; guard < 200; guard++) {
    const goalies = Math.min(teams * 2, Math.max(teams, Math.round(numPlayers * 0.075)));
    const skaters = numPlayers - goalies;
    if (skaters <= teams * 18 && goalies >= teams && goalies <= teams * 2) {
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
      teammateRequests: [],
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
      teammateRequests: [],
    });
  }

  // teammate requests, scaled relative to the original 98-skater baseline.
  // Each player can have up to 3 requests, each with its own reason — most
  // of the pairs below give a player a single request, with a smaller
  // supplementary pass adding a second (rarely third) request to some
  // already-requested players to reflect that.
  const scale = skaterCount / 98;
  const nSibling = Math.max(0, Math.round(6 * scale));
  const nAvoid = Math.max(0, Math.round(4 * scale));
  const nTransport = Math.max(0, Math.round(8 * scale));
  const nFriend = Math.max(0, Math.round(12 * scale));
  const nExtra = Math.max(0, Math.round(5 * scale)); // supplementary 2nd/3rd requests

  const pool = [...skaters];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let pIdx = 0;
  const addRequest = (a, b, reasonA, reasonB) => {
    if (a.teammateRequests.length < 3) a.teammateRequests.push({ request: b.name, reason: reasonA });
    if (reasonB && b.teammateRequests.length < 3) {
      b.teammateRequests.push({ request: a.name, reason: reasonB });
    }
  };
  for (let i = 0; i < nSibling && pIdx + 1 < pool.length; i++, pIdx += 2)
    addRequest(pool[pIdx], pool[pIdx + 1], "Sibling", "Sibling");
  for (let i = 0; i < nAvoid && pIdx + 1 < pool.length; i++, pIdx += 2)
    addRequest(pool[pIdx], pool[pIdx + 1], "Avoid", "Avoid");
  for (let i = 0; i < nTransport && pIdx + 1 < pool.length; i++, pIdx += 2)
    addRequest(pool[pIdx], pool[pIdx + 1], "Transportation");
  for (let i = 0; i < nFriend && pIdx + 1 < pool.length; i++, pIdx += 2)
    addRequest(pool[pIdx], pool[pIdx + 1], "Friend");
  // supplementary pass: give some players (with room left) an extra request
  const extraReasons = ["Friend", "Transportation"];
  for (let i = 0; i < nExtra && pIdx + 1 < pool.length; i++, pIdx += 2) {
    const a = pool[pIdx];
    const b = pool[pIdx + 1];
    if (a.teammateRequests.length < 3 && b.name !== a.name) {
      const reason = extraReasons[Math.floor(Math.random() * extraReasons.length)];
      a.teammateRequests.push({ request: b.name, reason });
    }
  }

  const allPlayers = [...players, ...skaters];
  for (let i = allPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
  }

  const playersCSV = [
    "Name,Year of Birth,Rating,Gender,Position,Teammate Request 1,Teammate Reason 1,Teammate Request 2,Teammate Reason 2,Teammate Request 3,Teammate Reason 3",
    ...allPlayers.map((p) => {
      const reqs = [0, 1, 2].map((i) => p.teammateRequests[i]);
      return [
        p.name,
        p.birthYear,
        p.rating,
        p.gender,
        p.position,
        ...reqs.flatMap((tr) => [tr ? tr.request : "", tr ? tr.reason : ""]),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    }),
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
  // roughly half the teams get a manager — managers don't count against the
  // 5-coach (head + assistant) cap, so they're generated separately
  for (let i = 0; i < teamCount; i++) {
    if (Math.random() < 0.5) {
      const mName = makeName(Math.random() < 0.5 ? "Male" : "Female");
      coachRows.push(csvRow([mName, "Manager", headNames[i], "", "", ""]));
    }
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

  // ---- position validation ----
  // A player whose Position doesn't resolve to Goalie/Forward/Defense would
  // otherwise silently fall out of position-based balancing AND the skater
  // roster cap entirely — they'd still get placed, just with none of the
  // position logic applied to them. That's a serious, easy-to-miss failure
  // mode, so it's caught loudly here instead.
  const unrecognizedPositions = players.filter((p) => !p.positionRecognized);
  if (unrecognizedPositions.length > 0) {
    const examples = [...new Set(unrecognizedPositions.map((p) => `"${p.position}"`))].slice(0, 5);
    errors.push(
      `${unrecognizedPositions.length} player${unrecognizedPositions.length > 1 ? "s have" : " has"} a Position value that isn't recognized as Goalie, Forward, or Defense (${examples.join(
        ", "
      )}${unrecognizedPositions.length > 5 ? ", ..." : ""}) — these players were NOT counted toward position balance or the 18-skater roster cap. Fix the Position column and re-run: ${unrecognizedPositions
        .slice(0, 10)
        .map((p) => p.name)
        .join(", ")}${unrecognizedPositions.length > 10 ? ", ..." : ""}`
    );
  }

  // ---- role validation ----
  // Same idea as position validation above — a Role that doesn't resolve to
  // Head/Assistant/Manager would otherwise silently fall through as neither
  // counted toward the head-coach total nor the 5-coach cap.
  const unrecognizedRoles = coaches.filter((c) => !c.roleRecognized);
  if (unrecognizedRoles.length > 0) {
    const examples = [...new Set(unrecognizedRoles.map((c) => `"${c.role}"`))].slice(0, 5);
    errors.push(
      `${unrecognizedRoles.length} coach${unrecognizedRoles.length > 1 ? "es have" : " has"} a Role value that isn't recognized as Head, Assistant, or Manager (${examples.join(
        ", "
      )}${unrecognizedRoles.length > 5 ? ", ..." : ""}): ${unrecognizedRoles
        .map((c) => c.name)
        .join(", ")}. Fix the Role column and re-run.`
    );
  }

  const headCoaches = coaches.filter((c) => key(c.role) === "head");
  const isHead = (c) => key(c.role) === "head";
  const isManager = (c) => key(c.role) === "manager";

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
  // otherwise held aside as "floating" (assistants/managers who never
  // connected to a head coach through a request) and distributed evenly
  // further down. Teams are capped at 5 coaches counting head + assistants
  // only — managers don't count against that cap.
  const COACH_ASSISTANT_CAP = 5;
  const headPlusAssistantCount = Array(teamCount).fill(1); // 1 for each team's head
  const totalCoachCountPerTeam = Array(teamCount).fill(1); // includes managers, used for floating balance only

  const coachFinalTeam = {}; // coach.idx -> team index
  const floatingGroups = [];
  Object.values(coachGroups).forEach((group) => {
    const heads = group.filter(isHead);
    if (heads.length === 0) {
      floatingGroups.push(group);
    } else {
      const ti = headTeamIdx[heads[0].idx];
      const nonHeadAssistants = group.filter((c) => !isHead(c) && !isManager(c)).length;
      const nonHeadManagers = group.filter((c) => !isHead(c) && isManager(c)).length;
      if (headPlusAssistantCount[ti] + nonHeadAssistants > COACH_ASSISTANT_CAP) {
        errors.push(
          `Team ${ti + 1} (${teamHeadName[ti]}) exceeds the 5-coach cap (head + assistants — managers don't count against it) because of coaching-together requests among ${group
            .map((c) => c.name)
            .join(", ")}. Placed anyway — review manually.`
        );
      }
      group.forEach((c) => {
        coachFinalTeam[c.idx] = ti;
      });
      headPlusAssistantCount[ti] += nonHeadAssistants;
      totalCoachCountPerTeam[ti] += nonHeadAssistants + nonHeadManagers;
    }
  });

  // distribute floating groups (no request connecting them to any head) —
  // prefer a team with room under the 5-coach cap for any assistants in the
  // group (managers in the group never count against that cap), then break
  // ties by whichever team has the fewest coaches overall so far.
  floatingGroups
    .sort((a, b) => b.length - a.length)
    .forEach((group) => {
      const assistantsInGroup = group.filter((c) => !isManager(c)).length;
      let candidateIdxs = [];
      for (let i = 0; i < teamCount; i++) {
        if (headPlusAssistantCount[i] + assistantsInGroup <= COACH_ASSISTANT_CAP) candidateIdxs.push(i);
      }
      if (candidateIdxs.length === 0) {
        candidateIdxs = Array.from({ length: teamCount }, (_, i) => i);
        errors.push(
          `Could not find a team with room under the 5-coach cap for ${group
            .map((c) => c.name)
            .join(", ")}. Placed on the least-bad team — review manually.`
        );
      }
      let best = candidateIdxs[0];
      candidateIdxs.forEach((i) => {
        if (totalCoachCountPerTeam[i] < totalCoachCountPerTeam[best]) best = i;
      });
      group.forEach((c) => {
        coachFinalTeam[c.idx] = best;
      });
      headPlusAssistantCount[best] += assistantsInGroup;
      totalCoachCountPerTeam[best] += group.length;
    });

  // ---- player index ----
  const byName = {};
  players.forEach((p) => {
    if (p.name) byName[key(p.name)] = p;
  });

  // ---- union-find for siblings ----
  const uf = new UF(players.length);
  players.forEach((p) => {
    p.teammateRequests.forEach((tr) => {
      if (key(tr.reason) !== "sibling") return;
      const target = byName[key(tr.request)];
      if (target) uf.union(p.idx, target.idx);
      else
        warnings.push(
          `${p.name}'s sibling request "${tr.request}" was not found in the player list.`
        );
    });
  });

  // ---- avoid pairs ----
  const avoidPairs = [];
  players.forEach((p) => {
    p.teammateRequests.forEach((tr) => {
      if (key(tr.reason) !== "avoid") return;
      const target = byName[key(tr.request)];
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
          `${p.name}'s avoid request "${tr.request}" was not found in the player list.`
        );
      }
    });
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
  if (totalSkaters > teamCount * 18) {
    errors.push(
      `${totalSkaters} skaters exceed the maximum capacity of ${teamCount * 18} (${teamCount} teams x 18). Some players will not be placed.`
    );
  }

  // Every team should end up the same total size (goalies + skaters), with at
  // most 1 extra player on some teams when the roster doesn't divide evenly.
  // e.g. 148 players / 8 teams -> 4 teams of 19, 4 teams of 18.
  const totalRosterCount = totalGoalies + totalSkaters;
  const baseTeamSize = Math.floor(totalRosterCount / teamCount);
  const maxTeamSize = Math.ceil(totalRosterCount / teamCount); // baseTeamSize, or +1 if there's a remainder

  // Same idea for top-rated (4+) and bottom-rated (under 2) skaters: an equal
  // split across teams, ±1 when the count doesn't divide evenly.
  const totalHighAll = units.reduce((s, u) => s + u.highRatedCount, 0);
  const totalLowAll = units.reduce((s, u) => s + u.lowRatedCount, 0);
  const baseHighPerTeam = Math.floor(totalHighAll / teamCount);
  const maxHighPerTeam = Math.ceil(totalHighAll / teamCount);
  const baseLowPerTeam = Math.floor(totalLowAll / teamCount);
  const maxLowPerTeam = Math.ceil(totalLowAll / teamCount);

  // ---- initialize team accumulators ----
  const teams = Array.from({ length: teamCount }, (_, i) => ({
    index: i,
    coach: teamHeadName[i],
    assistants: [],
    managers: [],
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
    if (!teams[ti]) return;
    if (isManager(c)) teams[ti].managers.push(c.name);
    else teams[ti].assistants.push(c.name);
  });

  const GOALIE_CAP = 2;
  const SKATER_CAP = 18;
  // number of teams allowed to have baseTeamSize+1 (the "remainder" players)
  const bonusSlots = totalRosterCount % teamCount;
  const bonusHighSlots = totalHighAll % teamCount;
  const bonusLowSlots = totalLowAll % teamCount;

  function teamTotal(t) {
    return t.goalieCount + t.forwardCount + t.defenseCount;
  }

  // A single fixed ceiling for every team isn't enough to guarantee a ±1
  // spread: more than `bonusSlots` teams could each independently reach that
  // ceiling, which then starves whichever teams are left, pushing them more
  // than 1 below the rest. So the cap for a given team is dynamic — once
  // `bonusSlots` teams have already claimed the +1 tier, everyone else is
  // held to the plain baseTeamSize. Same pattern for the high/low-rated caps.
  function effectiveCapFor(team) {
    if (bonusSlots === 0) return baseTeamSize;
    if (teamTotal(team) >= maxTeamSize) return maxTeamSize;
    const teamsAtBonusTier = teams.filter((t) => t !== team && teamTotal(t) >= maxTeamSize).length;
    return teamsAtBonusTier >= bonusSlots ? baseTeamSize : maxTeamSize;
  }
  function effectiveHighCapFor(team) {
    if (bonusHighSlots === 0) return baseHighPerTeam;
    if (team.highRatedCount >= maxHighPerTeam) return maxHighPerTeam;
    const teamsAtBonusTier = teams.filter(
      (t) => t !== team && t.highRatedCount >= maxHighPerTeam
    ).length;
    return teamsAtBonusTier >= bonusHighSlots ? baseHighPerTeam : maxHighPerTeam;
  }
  function effectiveLowCapFor(team) {
    if (bonusLowSlots === 0) return baseLowPerTeam;
    if (team.lowRatedCount >= maxLowPerTeam) return maxLowPerTeam;
    const teamsAtBonusTier = teams.filter(
      (t) => t !== team && t.lowRatedCount >= maxLowPerTeam
    ).length;
    return teamsAtBonusTier >= bonusLowSlots ? baseLowPerTeam : maxLowPerTeam;
  }
  // NOTE: effectiveHighCapFor/effectiveLowCapFor are deliberately only used
  // in the swap/local-search phase below, not in canPlace. Enforcing all 3
  // dynamic caps (size, high, low) as hard blocks during the initial greedy
  // placement turned out to be fragile — in a tight roster with little
  // slack, placement could get stuck with nowhere valid to put a unit and
  // dump a whole run of players onto a single team instead of spreading
  // them out. The swap phase doesn't have that risk (a rejected swap just
  // tries the next candidate pair), so that's where these are enforced as a
  // hard filter — the initial placement leans on the cost-weighted target
  // below instead, then the swap phase pulls it the rest of the way to even.

  // just the hard absolute limits (18 skaters, 1-2 goalies) — used as a
  // fallback tier that's still stricter than "anything goes" when the
  // equal-size target and an avoid request can't both be honored
  function withinAbsoluteCaps(team, unit) {
    if (team.goalieCount + unit.goalieCount > GOALIE_CAP) return false;
    if (
      team.forwardCount + team.defenseCount + unit.forwardCount + unit.defenseCount >
      SKATER_CAP
    )
      return false;
    return true;
  }

  function canPlace(team, unit) {
    if (!withinAbsoluteCaps(team, unit)) return false;
    // keep every team at the same total size (±1 for an uneven roster)
    const unitSize = unit.goalieCount + unit.forwardCount + unit.defenseCount;
    if (teamTotal(team) + unitSize > effectiveCapFor(team)) return false;
    return true;
  }
  function violatesAvoid(team, unit) {
    return avoidUnitPairs.some(
      ([a, b]) =>
        (a === unit && team.units.includes(b)) || (b === unit && team.units.includes(a))
    );
  }
  function placementCost(team, unit, avgOverall, avgFwd, avgDef, idealByYear) {
    const newRating = team.ratingSum + unit.ratingSum;
    const newFwdCount = team.forwardCount + unit.forwardCount;
    const newDefCount = team.defenseCount + unit.defenseCount;
    const newFwdRating = team.forwardRatingSum + unit.forwardRatingSum;
    const newDefRating = team.defenseRatingSum + unit.defenseRatingSum;
    // "Overall" is meant to reflect the WHOLE roster (goalies included), so
    // the denominator is the full player count, not just skaters —
    // ratingSum already includes goalie ratings (see place()), so dividing
    // by skaters-only here would inflate the average. See newTotal below.
    const newTotal =
      team.goalieCount + team.forwardCount + team.defenseCount + unit.goalieCount + unit.forwardCount + unit.defenseCount;
    const overallAvg = newTotal ? newRating / newTotal : 0;
    const fwdAvg = newFwdCount ? newFwdRating / newFwdCount : 0;
    const defAvg = newDefCount ? newDefRating / newDefCount : 0;
    let cost =
      Math.abs(overallAvg - avgOverall) * 2 +
      Math.abs(fwdAvg - avgFwd) +
      Math.abs(defAvg - avgDef);
    // keep the number of forwards and defense per team close to even —
    // reward whichever team currently has fewer (see the note below on why
    // "closeness to the average" is the wrong formula for this)
    if (unit.forwardCount > 0) cost += newFwdCount * 4;
    if (unit.defenseCount > 0) cost += newDefCount * 4;
    // keep every team's TOTAL roster size (goalies + skaters) as even as
    // possible — weighted above position balance since an equal team size is
    // the top ask here; the hard cap in canPlace already prevents any team
    // from exceeding its share, this just steers placement to fill evenly
    // rather than letting one team hit the cap early while another lags
    cost += newTotal * 12;
    // spread out top-rated (4+) and bottom-rated (<2) skaters instead of
    // letting them cluster — reward whichever team currently has fewer, not
    // "closeness to the average". Deviation-from-average is the wrong
    // formula here: adding to a below-target team keeps shrinking its
    // deviation, so the same team keeps looking cheapest right up until it
    // overshoots the target — that's what caused a real clustering bug
    // during testing (one team with 16 high-rated skaters, another with 0).
    // Rewarding the lower current count directly avoids that. Only applies
    // when this unit actually contains a high/low-rated player.
    const newHigh = team.highRatedCount + unit.highRatedCount;
    const newLow = team.lowRatedCount + unit.lowRatedCount;
    if (unit.highRatedCount > 0) cost += newHigh * 6;
    if (unit.lowRatedCount > 0) cost += newLow * 6;
    // keep each birth year's count per team close to even — works for any
    // set of birth years present in the data, not just a fixed pair
    Object.keys(idealByYear).forEach((y) => {
      const unitYearCount = unit.birthYears[y] || 0;
      if (unitYearCount === 0) return;
      const newYearCount = (team.birthYears[y] || 0) + unitYearCount;
      cost += newYearCount * 1.5;
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
  // Within that pass, when a team is going to get two goalies, pair its
  // strongest available goalie with its weakest rather than two similarly
  // rated ones — see pairSingleGoalieUnits below.
  const movableGoalieUnits = stillMovable.filter((u) => u.goalieCount > 0);

  // helper shared by both the paired and single-slot placements below:
  // finds the best team (from candidatesPool) for a goalie unit, preferring
  // teams with the fewest goalies so far (so every team reaches at least 1
  // before any team gets a 2nd), then balancing goalie rating between teams.
  // Uses goalieRatingSum (not ratingSum) so a unit that also carries
  // non-goalie teammates (e.g. a goalie/forward sibling pair) doesn't skew
  // the goalie-average comparison with skater ratings.
  function placeGoalieUnit(u, candidatesPool) {
    let candidates = candidatesPool.filter((t) => canPlace(t, u) && !violatesAvoid(t, u));
    if (candidates.length === 0) {
      // relax the equal-size target first, but keep the avoid request and
      // the absolute 1-2 goalie cap intact if at all possible
      candidates = candidatesPool.filter((t) => withinAbsoluteCaps(t, u) && !violatesAvoid(t, u));
      if (candidates.length === 0) {
        // avoid can't be honored alongside the goalie cap either — relax
        // avoid next, still trying to respect the absolute cap
        candidates = candidatesPool.filter((t) => withinAbsoluteCaps(t, u));
        if (candidates.length === 0) candidates = candidatesPool.length ? candidatesPool : teams;
      }
      errors.push(
        `Could not find a team for goalie(s) ${u.names.join(
          ", "
        )} within the 1-2 goalie cap or without breaking an avoid request. Placed on the least-bad team — please review.`
      );
    }
    let best = candidates[0];
    let bestCost = Infinity;
    candidates.forEach((t) => {
      const currentAvg = t.goalieCount ? t.goalieRatingSum / t.goalieCount : 0;
      const newAvg = (t.goalieRatingSum + u.goalieRatingSum) / (t.goalieCount + u.goalieCount);
      const cost = t.goalieCount * 100 + Math.abs(newAvg - currentAvg);
      if (cost < bestCost) {
        bestCost = cost;
        best = t;
      }
    });
    place(best, u);
    return best;
  }

  // Units that already carry 2+ goalies (e.g. two goalie siblings who
  // requested to stay together) have their pairing fixed by that request —
  // there's nothing to re-optimize, so place them as a block using the
  // fewest-goalies-first + average-balancing logic above.
  const multiGoalieUnits = movableGoalieUnits
    .filter((u) => u.goalieCount > 1)
    .sort((a, b) => b.goalieCount - a.goalieCount || b.goalieRatingSum - a.goalieRatingSum);
  multiGoalieUnits.forEach((u) => placeGoalieUnit(u, teams));

  // Single-goalie units: two phases, in strict priority order.
  //
  // Phase 1 — coverage: every team must reach at least one goalie before
  // any team gets a second. This is non-negotiable (a team with zero
  // goalies is a hard failure), so it happens first, using the same
  // fewest-goalies-first logic as multi-goalie units above. Units are
  // pulled from the middle of the sorted list where possible so the true
  // extremes survive for Phase 2 — though if a stronger constraint (avoid,
  // caps) forces a different unit to be consumed instead, that's fine too.
  //
  // Phase 2 — pairing: whatever single goalies are left AFTER coverage is
  // satisfied are the real surplus, and only these get the strongest/
  // weakest treatment. Each surplus goalie becomes a SECOND goalie on some
  // team that already has exactly one — matched so the team with the
  // lowest current goalie rating gets the highest remaining surplus goalie
  // (and vice versa), rather than clustering similar ratings together.
  const singleGoalieUnits = movableGoalieUnits.filter((u) => u.goalieCount === 1);
  const sortedSingles = [...singleGoalieUnits].sort(
    (a, b) => a.goalieRatingSum - b.goalieRatingSum
  );

  while (sortedSingles.length > 0 && teams.some((t) => t.goalieCount === 0)) {
    const midIdx = Math.floor(sortedSingles.length / 2);
    const u = sortedSingles.splice(midIdx, 1)[0];
    placeGoalieUnit(u, teams);
  }

  if (sortedSingles.length > 0) {
    const eligibleTeams = teams
      .filter((t) => t.goalieCount === 1)
      .sort((a, b) => a.goalieRatingSum / a.goalieCount - b.goalieRatingSum / b.goalieCount);
    const leftoverDesc = [...sortedSingles].sort((a, b) => b.goalieRatingSum - a.goalieRatingSum);
    const pairCount = Math.min(eligibleTeams.length, leftoverDesc.length);
    const matchedIds = new Set();
    for (let k = 0; k < pairCount; k++) {
      const team = eligibleTeams[k];
      const u = leftoverDesc[k];
      matchedIds.add(u.id);
      if (canPlace(team, u) && !violatesAvoid(team, u)) {
        place(team, u);
      } else {
        // this specific extreme match isn't legal (avoid request or a cap
        // got in the way) — fall back to normal best-fit placement for it
        placeGoalieUnit(u, teams);
      }
    }
    // anything beyond pairCount (e.g. more surplus goalies than teams that
    // can still take a second) falls back to normal best-fit placement
    sortedSingles.filter((u) => !matchedIds.has(u.id)).forEach((u) => placeGoalieUnit(u, teams));
  }

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
  // spread across teams instead of clustering (totals already computed above
  // for the hard-cap logic; reused here as fractional cost targets)
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
    // "Overall" includes goalies (ratingSum already does — see place()), so
    // the denominator has to be every rostered player, not skaters alone.
    const totalRosteredNow =
      teams.reduce((s, t) => s + t.goalieCount + t.forwardCount + t.defenseCount, 0) || 1;
    const avgOverall = totalRatingSum / totalRosteredNow;
    const totalFwd = teams.reduce((s, t) => s + t.forwardCount, 0) || 1;
    const totalFwdRating = teams.reduce((s, t) => s + t.forwardRatingSum, 0);
    const avgFwd = totalFwdRating / totalFwd;
    const totalDef = teams.reduce((s, t) => s + t.defenseCount, 0) || 1;
    const totalDefRating = teams.reduce((s, t) => s + t.defenseRatingSum, 0);
    const avgDef = totalDefRating / totalDef;

    let candidates = teams.filter((t) => canPlace(t, u) && !violatesAvoid(t, u));
    if (candidates.length === 0) {
      // relax the equal-size target first, but keep the avoid request and
      // the absolute 18-skater cap intact if at all possible
      candidates = teams.filter((t) => withinAbsoluteCaps(t, u) && !violatesAvoid(t, u));
      if (candidates.length === 0) {
        // avoid can't be honored alongside the skater cap either — relax
        // avoid next, still trying to respect the absolute cap
        candidates = teams.filter((t) => withinAbsoluteCaps(t, u));
        if (candidates.length === 0) candidates = teams;
      }
      errors.push(
        `Could not find a team for ${u.names.join(
          ", "
        )} without breaking roster caps or an avoid request. Placed on the least-bad team — please review.`
      );
    }
    let best = candidates[0];
    let bestCost = Infinity;
    candidates.forEach((t) => {
      const c = placementCost(t, u, avgOverall, avgFwd, avgDef, idealByYear);
      if (c < bestCost) {
        bestCost = c;
        best = t;
      }
    });
    place(best, u);
  });

  // ---- local search swap improvement ----
  function totalImbalance() {
    // total roster count (goalies + skaters) — ratingSum already includes
    // goalie ratings (see place()), so "overall" has to divide by everyone,
    // not skaters alone, or it comes out inflated.
    const totalCounts = teams.map((t) => t.goalieCount + t.forwardCount + t.defenseCount);
    const overallAvgs = teams.map((t, i) => (totalCounts[i] ? t.ratingSum / totalCounts[i] : 0));
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
      spread(highCounts) * 6 +
      spread(lowCounts) * 6 +
      spread(totalCounts) * 12;
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

  // goalie units are excluded here — they were deliberately paired
  // strongest-with-weakest above, and this general swap pass (which only
  // optimizes for overall/forward/defense balance) has no notion of that
  // pairing, so letting it touch goalie units could undo it.
  const movableUnits = units.filter((u) => u.lockedTeam === null && u.goalieCount === 0);
  let improved = true;
  let passes = 0;
  while (improved && passes < 8) {
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
        // keep both teams' total roster size within the equal-size target
        if (
          taGoalieAfter + taSkaterAfter > effectiveCapFor(ta) ||
          tbGoalieAfter + tbSkaterAfter > effectiveCapFor(tb)
        )
          continue;
        // and the 4+/under-2 rated skater counts — enforced here rather than
        // during initial placement (see the note above effectiveHighCapFor)
        const taHighAfter = ta.highRatedCount - ua.highRatedCount + ub.highRatedCount;
        const tbHighAfter = tb.highRatedCount - ub.highRatedCount + ua.highRatedCount;
        const taLowAfter = ta.lowRatedCount - ua.lowRatedCount + ub.lowRatedCount;
        const tbLowAfter = tb.lowRatedCount - ub.lowRatedCount + ua.lowRatedCount;
        if (taHighAfter > effectiveHighCapFor(ta) || tbHighAfter > effectiveHighCapFor(tb)) continue;
        if (taLowAfter > effectiveLowCapFor(ta) || tbLowAfter > effectiveLowCapFor(tb)) continue;
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
  // team sizes should differ by at most 1 (an uneven roster means some teams
  // get one extra player) — if they differ by more, something forced it
  const teamTotals = teams.map((t) => t.goalieCount + t.forwardCount + t.defenseCount);
  const teamSizeSpread = Math.max(...teamTotals) - Math.min(...teamTotals);
  if (teamSizeSpread > 1) {
    const sizesSummary = teams.map((t, i) => `Team ${i + 1}: ${teamTotals[i]}`).join(", ");
    errors.push(
      `Team sizes ended up more than 1 player apart (${sizesSummary}) instead of the even split expected. This is usually caused by coach's-kids or sibling/avoid groups being too large or concentrated to distribute evenly — review those requirements.`
    );
  }
  // same ±1 check for the 4+ and under-2 rated skater counts
  const highTotals = teams.map((t) => t.highRatedCount);
  const highSpread = Math.max(...highTotals) - Math.min(...highTotals);
  if (highSpread > 1) {
    const summary = teams.map((t, i) => `Team ${i + 1}: ${highTotals[i]}`).join(", ");
    errors.push(
      `The number of 4+ rated skaters ended up more than 1 apart between teams (${summary}) instead of the even split expected. This is usually caused by a sibling/avoid/coach's-kid group concentrating several highly-rated players on one team.`
    );
  }
  const lowTotals = teams.map((t) => t.lowRatedCount);
  const lowSpread = Math.max(...lowTotals) - Math.min(...lowTotals);
  if (lowSpread > 1) {
    const summary = teams.map((t, i) => `Team ${i + 1}: ${lowTotals[i]}`).join(", ");
    errors.push(
      `The number of under-2 rated skaters ended up more than 1 apart between teams (${summary}) instead of the even split expected. This is usually caused by a sibling/avoid/coach's-kid group concentrating several lower-rated players on one team.`
    );
  }

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
    p.teammateRequests.forEach((tr) => {
      const reason = key(tr.reason);
      const isAvoid = reason === "avoid";
      if (!["sibling", "avoid", "transportation", "friend"].includes(reason)) return;
      const target = byName[key(tr.request)];
      if (!target) return; // already flagged in warnings as a name-not-found issue
      const sameTeam = playerTeamIndex[p.idx] === playerTeamIndex[target.idx];
      // for Avoid, "fulfilled" means they were kept APART, not together
      const honored = isAvoid ? !sameTeam : sameTeam;
      tr.fulfilled = honored;
      const entry = {
        name: p.name,
        request: tr.request,
        reason: tr.reason,
        playerTeam: playerTeamIndex[p.idx],
        targetTeam: playerTeamIndex[target.idx],
      };
      if (honored) fulfilledRequests.push(entry);
      else unfulfilledRequests.push(entry);
    });
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
      "Managers",
      "Name",
      "Position",
      "Year of Birth",
      "Rating",
      "Gender",
      "Coach's Child",
      "Teammate Request 1",
      "Teammate Reason 1",
      "Teammate Request 1 Fulfilled",
      "Teammate Request 2",
      "Teammate Reason 2",
      "Teammate Request 2 Fulfilled",
      "Teammate Request 3",
      "Teammate Reason 3",
      "Teammate Request 3 Fulfilled",
    ],
  ];
  teams.forEach((t) => {
    t.units.forEach((u) => {
      u.members.forEach((m) => {
        const reqs = [0, 1, 2].map((i) => m.teammateRequests[i]);
        rows.push([
          t.index + 1,
          t.coach,
          t.assistants.join(" / "),
          t.managers.join(" / "),
          m.name,
          m.position,
          m.birthYear,
          m.rating,
          m.gender,
          m.isCoachChild ? "Yes" : "",
          ...reqs.flatMap((tr) => [
            tr ? tr.request : "",
            tr ? tr.reason : "",
            tr ? (tr.fulfilled ? "Yes" : "No") : "",
          ]),
        ]);
      });
    });
  });
  // Guard against CSV/formula injection: a cell that starts with =, +, -, or @
  // gets interpreted as a formula by Excel/Sheets when the file is reopened.
  // Prefixing it with a leading apostrophe forces those apps to treat it as
  // plain text instead of executing it.
  const escapeFormula = (v) => {
    const s = String(v);
    return /^[=+\-@]/.test(s) ? `'${s}` : s;
  };
  const csv = rows
    .map((r) => r.map((c) => `"${escapeFormula(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
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
  const [sampleOpen, setSampleOpen] = useState(false);

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
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Sora:wght@700;800&family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@500&display=swap');
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
          font-family: 'Inter', sans-serif;
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
          font-family: 'Sora', sans-serif;
          font-weight: 800;
          font-size: 18px;
          margin: 0 0 4px;
        }
        .panel .sub { color: var(--muted); font-size: 15px; margin: 0 0 18px; }
        .fileRow { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 16px; }
        .stepLabel {
          font-family: 'Roboto Mono', monospace;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
          margin: 0 0 8px;
        }
        .sampleBox {
          background: #F7FAFD;
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-bottom: 24px;
          overflow: hidden;
        }
        .sampleBox-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 14px 18px;
          text-align: left;
          font-family: 'Inter', sans-serif;
        }
        .sampleBox-toggle:hover { background: #EFF4FA; }
        .sampleBox-toggle-text { display: flex; flex-direction: column; gap: 2px; }
        .sampleBox-label {
          font-family: 'Sora', sans-serif;
          font-weight: 800;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--rink-navy);
        }
        .sampleBox-tagline { font-size: 13px; color: var(--muted); }
        .sampleBox-chevron {
          font-size: 13px;
          color: var(--muted);
          transition: transform 0.15s ease;
          flex-shrink: 0;
        }
        .sampleBox-chevron.open { transform: rotate(180deg); }
        .sampleBox-body {
          padding: 4px 18px 18px;
          border-top: 1px solid var(--border);
        }
        .sampleBox-hint { font-size: 14px; color: var(--muted); margin: 14px 0 12px; }
        .sampleBox-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .sampleSelect {
          font-family: 'Inter', sans-serif;
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
          font-family: 'Inter', sans-serif;
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
          font-family: 'Sora', sans-serif;
          font-weight: 800;
          font-size: 14px;
          margin: 0 0 8px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--rink-navy);
        }
        .noteBox-summary { margin: 0 0 8px; font-size: 15px; color: var(--muted); }
        .noteBox ul { margin: 0; padding-left: 18px; font-size: 15px; line-height: 1.5; }
        .errorBox h3, .warnBox h3 {
          font-family: 'Sora', sans-serif;
          font-weight: 800;
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
          font-family: 'Sora', sans-serif;
          font-weight: 800;
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
        .teamCard-stats {
          display: flex;
          flex-direction: column;
          gap: 3px;
          font-size: 13px;
          color: var(--muted);
          font-family: 'Roboto Mono', monospace;
          margin-top: 10px;
        }
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
        .priorityNote {
          margin-top: 6px;
          padding: 8px 12px;
          background: #F4F8FB;
          border-left: 3px solid var(--border);
          font-size: 13.5px;
          color: var(--muted);
          border-radius: 4px;
        }
        .balanceList {
          margin: 0 0 14px;
          padding-left: 22px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          list-style: decimal;
        }
        .howBody-note { font-size: 13.5px; color: var(--muted); }
        .stepsList {
          margin: 0 0 20px;
          padding-left: 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          font-size: 15px;
          line-height: 1.5;
        }
        .stepsList li { padding-left: 4px; }
      `}</style>

      <div className="hero">
        <div className="hero-eyebrow">Season Roster Builder</div>
        <h1>Balance the Bench</h1>
        <p>
          Turn a full recreational season's registration list into balanced, fair teams in
          minutes — not for competitive teams. Upload your player and coach spreadsheets,
          set how many teams you're forming, and the builder does the rest — honoring coach and
          sibling requests first, then balancing skill, position, and birth year as evenly as
          possible around them.
        </p>
      </div>

      <div className="section">
        <div className="panel howPanel">
          <h2>What this is</h2>
          <p className="sub" style={{ marginBottom: 16 }}>
            This tool splits a full recreational season's registration list into balanced teams
            for your coaches — it's built for house-league/rec play, not for seeding a
            competitive draft. Upload a players spreadsheet and a coaches spreadsheet, tell
            it how many teams you're forming, and it assigns every player to a team — honoring
            the requests that matter most, then balancing everything else as evenly as it can
            around them.
          </p>
          <details>
            <summary>How team assignments are prioritized</summary>
            <div className="howBody">
              <p>
                Requests are honored in a strict order, top to bottom. The first three are{" "}
                <strong>hard requirements</strong> — never broken to improve balance. If two of
                them genuinely conflict (e.g. two head coaches both need the same assistant), the
                app still makes a decision and shows an error explaining the conflict, rather than
                failing silently. The last two are <strong>best effort</strong> — honored whenever
                possible, but the first things sacrificed if honoring them would throw a team badly
                out of balance.
              </p>
              <ol className="priorityList">
                <li>
                  <strong>Coaches who want to coach together.</strong> Any coach — Head, Assistant,
                  or Manager — can list up to 3 others they want to work with, and the app groups
                  them onto the same team wherever that's possible.
                  <div className="priorityNote">
                    Each team is capped at 5 coaches counting Head + Assistant only — Managers
                    don't count against that cap. If a coaching-together request would push a team
                    past that cap, it's still honored (this rule is the top priority) and flagged
                    as an error so you can review it. A request that would require merging two
                    different head coaches' teams can't be honored at all — that's also flagged.
                    Coaches with no request, or an unsuccessful one, are spread evenly across
                    teams.
                  </div>
                </li>
                <li>
                  <strong>Sibling requests</strong> — always kept together. A coach's own listed
                  children are treated the same way, automatically locked to whichever team that
                  coach ends up on.
                </li>
                <li>
                  <strong>Avoid requests</strong> — always kept apart.
                </li>
                <li>
                  <strong>Transportation requests</strong> — kept together when it doesn't cost too
                  much balance.
                </li>
                <li>
                  <strong>Friend requests</strong> — same as Transportation, lowest priority.
                </li>
              </ol>
              <p className="howBody-note">
                Each player can list up to 3 teammate requests, each with its own reason (Sibling,
                Avoid, Transportation, or Friend) — they're all honored according to the priority
                order above, independently of each other.
              </p>
              <p style={{ marginTop: 18 }}>
                <strong>Once requests are placed, everything else is balanced as evenly as
                possible</strong> across teams — most important first:
              </p>
              <ul className="balanceList">
                <li>Total roster size (within 1 player, if the roster doesn't divide evenly)</li>
                <li>Number of forwards and number of defense</li>
                <li>Overall skater rating</li>
                <li>Birth-year split</li>
                <li>Top-rated (4+) and lower-rated (under 2) skater counts</li>
                <li>Goalies (1–2 per team)</li>
                <li>Female players (never exactly 1 on a team — zero or at least two)</li>
              </ul>
              <p className="howBody-note">
                The results screen always shows exactly which requests couldn't be honored and
                why, so nothing is a silent trade-off.
              </p>
            </div>
          </details>
        </div>

        <div className="panel">
          <h2>New here? Start with a blank template</h2>
          <p className="sub">
            If you don't already have your player and coach lists in a spreadsheet, the fastest
            way to get going is to download the two blank templates below, fill them in, and
            upload them back here. No special software needed — a free Google Sheet works fine.
          </p>
          <ol className="stepsList">
            <li>
              <strong>Download both templates</strong> using the buttons below. Each one opens
              fine in Excel, Google Sheets, or Apple Numbers.
            </li>
            <li>
              <strong>Delete the example rows</strong> (the ones starting with "EXAMPLE") once
              you understand the format — they're just there to show you what a filled-in row
              looks like, including how a request references someone else by name.
            </li>
            <li>
              <strong>Add one row per person</strong> below the header row. Don't rename, reorder,
              or delete any of the column headers in the first row — the app looks for them by
              exact name.
            </li>
            <li>
              <strong>Spell names exactly the same everywhere.</strong> If you type a teammate or
              coaching request, it has to match that person's name in the `Name`/`Coach` column
              exactly — spelling, spacing, and extra initials all count. Capitalization doesn't
              matter (the app matches names case-insensitively), but a typo or a different name
              variant will still stop it from being found.
            </li>
            <li>
              <strong>Save your file as a CSV</strong>, not as an Excel or Sheets file:
              <div className="priorityNote">
                In Google Sheets: <strong>File → Download → Comma Separated Values (.csv)</strong>
                <br />
                In Excel: <strong>File → Save As</strong>, then choose <strong>CSV</strong> as the
                file type
              </div>
            </li>
            <li>
              <strong>Upload both CSV files</strong> in the "Upload rosters" section below, enter
              your number of teams, and click <strong>Generate teams</strong>.
            </li>
          </ol>
          <div className="controlsRow" style={{ marginTop: 4 }}>
            <button
              className="btn btn-outline"
              onClick={() => downloadTextFile("players_template.csv", BLANK_PLAYERS_TEMPLATE)}
            >
              Download blank players template
            </button>
            <button
              className="btn btn-outline"
              onClick={() => downloadTextFile("coaches_template.csv", BLANK_COACHES_TEMPLATE)}
            >
              Download blank coaches template
            </button>
          </div>
          <details style={{ marginTop: 18 }}>
            <summary>Column format reference</summary>
            <div className="howBody">
              <p>
                <strong>Players CSV</strong> — one row per player, with these columns:
              </p>
              <ul className="balanceList">
                <li><strong>Name</strong></li>
                <li><strong>Year of Birth</strong></li>
                <li><strong>Rating</strong></li>
                <li><strong>Gender</strong></li>
                <li>
                  <strong>Position</strong> — Goalie, Forward, or Defense ("Defence", "Def",
                  "Fwd" and single-letter abbreviations are also recognized)
                </li>
                <li>
                  <strong>Teammate Request 1 / 2 / 3</strong> and{" "}
                  <strong>Teammate Reason 1 / 2 / 3</strong> — up to 3 optional pairs, each
                  request naming another player and each reason being one of{" "}
                  <strong>Sibling</strong>, <strong>Avoid</strong>,{" "}
                  <strong>Transportation</strong>, or <strong>Friend</strong>
                </li>
              </ul>
              <p className="howBody-note">
                <strong>Coaches CSV</strong> — one row per coach, with these columns:
              </p>
              <ul className="balanceList">
                <li><strong>Coach</strong></li>
                <li>
                  <strong>Role</strong> — Head, Assistant, or Manager
                </li>
                <li>
                  <strong>Coach Request 1 / 2 / 3</strong> — up to 3 optional requests, each
                  naming another coach (any role) this person wants to coach with
                </li>
                <li>
                  <strong>Childs Names</strong> — optional; semicolon-separated if more than one
                </li>
              </ul>
              <p className="howBody-note">
                Teams are capped at 5 Head + Assistant coaches total — Managers don't count
                against that cap.
              </p>
            </div>
          </details>
        </div>

        <div className="panel">
          <h2>1. Upload rosters</h2>
          <p className="sub">
            Two CSVs required — one listing your players, one listing your coaches. Need the
            exact column names? See <strong>Column format reference</strong> above, or grab a
            blank template.
          </p>

          <div className="sampleBox">
            <button
              type="button"
              className="sampleBox-toggle"
              onClick={() => setSampleOpen((v) => !v)}
              aria-expanded={sampleOpen}
            >
              <span className="sampleBox-toggle-text">
                <span className="sampleBox-label">Don't have CSVs yet? Try sample data</span>
                <span className="sampleBox-tagline">
                  Generate a mock roster and skip straight to a working example
                </span>
              </span>
              <span className={`sampleBox-chevron${sampleOpen ? " open" : ""}`}>▼</span>
            </button>
            {sampleOpen && (
              <div className="sampleBox-body">
                <p className="sampleBox-hint">
                  Pick how many players you want (up to 200) and generate a mock roster sized to
                  match — the team count is worked out automatically so it always fits the app's
                  roster caps.
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
                      {mockData.skaterCount} skaters) across {mockData.teamCount} teams · birth
                      years {mockData.birthYears.join(" / ")}
                    </p>
                    <div className="sampleBox-row" style={{ marginTop: 10 }}>
                      <button className="btn btn-primary" onClick={loadMockIntoApp}>
                        Load into app
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() =>
                          downloadTextFile(
                            `players_mock_${mockData.totalPlayers}.csv`,
                            mockData.playersCSV
                          )
                        }
                      >
                        Download players CSV
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() =>
                          downloadTextFile(
                            `coaches_mock_${mockData.totalPlayers}.csv`,
                            mockData.coachesCSV
                          )
                        }
                      >
                        Download coaches CSV
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <p className="stepLabel">Your files</p>
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

          <p className="stepLabel" style={{ marginTop: 20 }}>Team count &amp; build</p>
          <div className="controlsRow" style={{ marginTop: 8 }}>
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
                const totalRoster = t.goalieCount + skaters;
                // ratingSum includes goalie ratings (see place()), so the
                // "overall" average has to divide by the whole roster, not
                // skaters alone, or it comes out higher than Fwd/Def.
                const overallAvg = totalRoster ? (t.ratingSum / totalRoster).toFixed(2) : "—";
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
                      {t.managers.length > 0 && (
                        <div className="teamCard-assist">Manager: {t.managers.join(", ")}</div>
                      )}
                    </div>
                    <div className="teamCard-body">
                      <StatBar label="Goalies" value={t.goalieCount} max={2} />
                      <StatBar label="Forwards" value={t.forwardCount} max={18} />
                      <StatBar label="Defense" value={t.defenseCount} max={18} />
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
                      <div className="teamCard-stats">
                        <div>{t.femaleCount} female</div>
                        {Object.keys(t.birthYears)
                          .sort()
                          .map((y) => (
                            <div key={y}>
                              {y}: {t.birthYears[y]}
                            </div>
                          ))}
                        <div>4+ rated: {t.highRatedCount}</div>
                        <div>Under 2 rated: {t.lowRatedCount}</div>
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
