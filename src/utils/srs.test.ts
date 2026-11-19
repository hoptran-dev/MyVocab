import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS,
  HOUR_MS,
  configureLevel6Schedule,
  createInitialSRS,
  createSeedState,
  evaluateSrsReview,
  filterGameCards,
  getLevelDistribution,
  isCardDue,
  normalizeSRS,
  parseBulkLines,
  pickMixedQuestionType,
  segmentPassageWithWords,
  selectDeepMemoryReviewQueue,
} from './srs';

const FIXED_NOW = 1_760_000_000_000;

test('6-level spaced repetition advances through exact intervals (2h, 1d, 2d, 3d, 5d, 8d)', () => {
  let srs = createInitialSRS(FIXED_NOW);
  assert.equal(srs.level, 0);

  // 0 -> 1: 2 hours
  let res = evaluateSrsReview(srs, true, FIXED_NOW);
  assert.equal(res.nextSrs.level, 1);
  assert.equal(res.nextSrs.dueDate, FIXED_NOW + 2 * HOUR_MS);
  assert.equal(res.justReachedLevel6, false);
  srs = res.nextSrs;

  // 1 -> 2: 1 day
  res = evaluateSrsReview(srs, true, FIXED_NOW);
  assert.equal(res.nextSrs.level, 2);
  assert.equal(res.nextSrs.dueDate, FIXED_NOW + 1 * DAY_MS);
  srs = res.nextSrs;

  // 2 -> 3: 2 days
  res = evaluateSrsReview(srs, true, FIXED_NOW);
  assert.equal(res.nextSrs.level, 3);
  assert.equal(res.nextSrs.dueDate, FIXED_NOW + 2 * DAY_MS);
  srs = res.nextSrs;

  // 3 -> 4: 3 days
  res = evaluateSrsReview(srs, true, FIXED_NOW);
  assert.equal(res.nextSrs.level, 4);
  assert.equal(res.nextSrs.dueDate, FIXED_NOW + 3 * DAY_MS);
  srs = res.nextSrs;

  // 4 -> 5: 5 days
  res = evaluateSrsReview(srs, true, FIXED_NOW);
  assert.equal(res.nextSrs.level, 5);
  assert.equal(res.nextSrs.dueDate, FIXED_NOW + 5 * DAY_MS);
  assert.equal(res.justReachedLevel6, false);
  srs = res.nextSrs;

  // 5 -> 6 (Nhớ sâu): 8 days default + triggers justReachedLevel6
  res = evaluateSrsReview(srs, true, FIXED_NOW);
  assert.equal(res.nextSrs.level, 6);
  assert.equal(res.nextSrs.dueDate, FIXED_NOW + 8 * DAY_MS);
  assert.equal(res.justReachedLevel6, true);
});

test('forgetting a word resets back to level 1 (2 hours) and clears noReview', () => {
  const srs = configureLevel6Schedule(
    { ...createInitialSRS(FIXED_NOW), level: 6 },
    { noReview: true },
    FIXED_NOW
  );
  assert.equal(srs.noReview, true);
  assert.equal(srs.dueDate, null);

  const forgotten = evaluateSrsReview(srs, false, FIXED_NOW);
  assert.equal(forgotten.nextSrs.level, 1);
  assert.equal(forgotten.nextSrs.noReview, false);
  assert.equal(forgotten.nextSrs.dueDate, FIXED_NOW + 2 * HOUR_MS);
});

test('level 6 customization supports custom review days and permanent noReview', () => {
  const base = { ...createInitialSRS(FIXED_NOW), level: 6 as const };

  const custom30 = configureLevel6Schedule(base, { noReview: false, reviewDays: 30 }, FIXED_NOW);
  assert.equal(custom30.level, 6);
  assert.equal(custom30.noReview, false);
  assert.equal(custom30.level6ReviewDays, 30);
  assert.equal(custom30.dueDate, FIXED_NOW + 30 * DAY_MS);

  const noReview = configureLevel6Schedule(custom30, { noReview: true }, FIXED_NOW);
  assert.equal(noReview.level, 6);
  assert.equal(noReview.noReview, true);
  assert.equal(noReview.dueDate, null);

  const seed = createSeedState(FIXED_NOW);
  const archivedCard = { ...seed.cards[0], srs: noReview };
  assert.equal(isCardDue(archivedCard, FIXED_NOW + 1000 * DAY_MS), false);
});

test('filterGameCards filters by deck, status, order, and quantity', () => {
  const seed = createSeedState(FIXED_NOW);

  const unmastered = filterGameCards(
    seed.cards,
    { deckId: 'all', statusFilter: 'unmastered', orderBy: 'az', quantity: 5 },
    FIXED_NOW
  );
  assert.equal(unmastered.length, 5);
  assert.ok(unmastered.every((c) => c.srs.level < 6));
  assert.ok(unmastered[0].word.localeCompare(unmastered[1].word) <= 0);

  const level6Only = filterGameCards(
    seed.cards,
    { deckId: 'all', statusFilter: 'level6', orderBy: 'newest', quantity: 'all' },
    FIXED_NOW
  );
  assert.equal(level6Only.length, 2);
  assert.ok(level6Only.every((c) => c.srs.level === 6));
});

test('legacy SM-2 srs object migrates cleanly to 6-level SRS', () => {
  const legacy = normalizeSRS({ reps: 3, interval: 6, ease: 2.5, dueDate: FIXED_NOW }, FIXED_NOW);
  assert.equal(legacy.level, 3);
  assert.equal(legacy.noReview, false);
  assert.equal(legacy.level6ReviewDays, 8);
});

test('segmentPassageWithWords highlights multi-word phrases and single words accurately', () => {
  const passage = 'The startup began to take off because the team was resilient.';
  const segs = segmentPassageWithWords(passage, [
    { id: 'c1', word: 'take off', matchedForm: 'take off' },
    { id: 'c2', word: 'resilient', matchedForm: 'resilient' },
  ]);
  const highlighted = segs.filter((s) => s.candidateId);
  assert.equal(highlighted.length, 2);
  assert.equal(highlighted[0].text, 'take off');
  assert.equal(highlighted[0].candidateId, 'c1');
  assert.equal(highlighted[1].text, 'resilient');
  assert.equal(highlighted[1].candidateId, 'c2');
});

test('parseBulkLines parses pipe and tab delimited lines and skips invalid rows', () => {
  const parsed = parseBulkLines('apple | quả táo | /ˈæp.əl/ | I eat an apple.\ninvalidline\ncoffee\tcà phê');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].word, 'apple');
  assert.equal(parsed[1].word, 'coffee');
});

test('getLevelDistribution counts levels and archived cards accurately', () => {
  const seed = createSeedState(FIXED_NOW);
  const dist = getLevelDistribution(seed.cards);
  assert.equal(dist[6], 2);
  assert.equal(dist.archived, 1);
  assert.equal(dist[5], 2);
});

test('pickMixedQuestionType cycles enabled modes and falls back safely when empty', () => {
  assert.equal(pickMixedQuestionType(0, ['dictation', 'typing']), 'dictation');
  assert.equal(pickMixedQuestionType(1, ['dictation', 'typing']), 'typing');
  assert.equal(pickMixedQuestionType(2, ['dictation', 'typing']), 'dictation');
  assert.equal(pickMixedQuestionType(0, []), 'quiz');
});

test('selectDeepMemoryReviewQueue prioritizes due cards and excludes noReview level 6 cards', () => {
  const seed = createSeedState(FIXED_NOW);
  const queue = selectDeepMemoryReviewQueue(seed.cards, 'all', 20, FIXED_NOW);
  assert.ok(queue.length > 0);
  // Due level 5 cards appear first so learners can graduate them to level 6
  assert.equal(queue[0].srs.level, 5);
  assert.ok(queue.every((c) => !(c.srs.level === 6 && c.srs.noReview)));

  const level5Filtered = filterGameCards(
    seed.cards,
    { deckId: 'all', statusFilter: 'all', orderBy: 'az', quantity: 'all', levelFilter: 5 },
    FIXED_NOW
  );
  assert.equal(level5Filtered.length, 2);
  assert.ok(level5Filtered.every((c) => c.srs.level === 5));
});
