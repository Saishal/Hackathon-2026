import { useCallback, useEffect, useMemo, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { can, hrefForLink } from '../components/format';
import { readStored, writeStored } from '../preferences/storage';
import { isViewAllowed } from '../views';

// The notification hub is built from what the signed-in person can already read: suggestions, changes waiting
// for their review, decisions on their own submissions, critical data-quality issues, overdue risk owners and
// coverage events. Every source is optional; one that is not permitted or fails is simply left out, and the
// server has already narrowed each response to the person's team or profile. Read marks and muted categories
// are personal and stay in this browser.

export const NOTIFICATION_CATEGORIES = ['reviews', 'risks', 'data', 'updates'];

const POLL_MS = 90 * 1000;
const RECENT_DAYS = 30;
const MAX_QUALITY_ITEMS = 10;
const MAX_READ_MARKS = 400;
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };
const COVERAGE_EVENTS = new Set(['risk.critical_skill_uncovered', 'risk.coverage_restored', 'risk.single_holder_resolved']);

const optional = (enabled, load) => (enabled ? load().catch(() => null) : Promise.resolve(null));
const isRecent = (value, now) => Boolean(value) && now - new Date(value).getTime() <= RECENT_DAYS * 86400000;

export function buildNotifications({ session, suggestions, changes, quality, acknowledgements, audit, now = Date.now() }) {
  const items = [];
  const me = session.user.id;

  for (const item of suggestions?.items ?? []) {
    if (item.severity === 'info') continue;
    items.push({
      id: `suggestion:${item.key}`, kind: 'suggestion', category: 'risks', severity: item.severity,
      title: item.title, detail: item.detail, href: item.actions?.[0]?.href ?? '#/overview', at: null,
    });
  }

  for (const request of changes?.items ?? []) {
    if (request.canReview) {
      items.push({
        id: `review:${request.id}:${request.submittedAt}`, kind: 'reviewPending', category: 'reviews', severity: 'warning',
        vars: { type: request.typeLabel, target: request.targetLabel, name: request.requestedBy.name },
        href: '#/reviews', at: request.submittedAt,
      });
    } else if (request.requestedBy.id === me && ['approved', 'rejected'].includes(request.status) && isRecent(request.reviewedAt, now)) {
      const approved = request.status === 'approved';
      items.push({
        id: `decision:${request.id}:${request.status}`, kind: approved ? 'changeApproved' : 'changeRejected', category: 'updates',
        severity: approved ? 'info' : 'warning',
        vars: { type: request.typeLabel, target: request.targetLabel, name: request.reviewedBy?.name ?? '' },
        detail: request.reviewerComment || null,
        href: isViewAllowed(session, 'reviews') ? '#/reviews' : '#/profile', at: request.reviewedAt,
      });
    }
  }

  for (const issue of (quality?.issues ?? []).filter((entry) => entry.severity !== 'info').slice(0, MAX_QUALITY_ITEMS)) {
    items.push({
      id: `quality:${issue.fingerprint}`, kind: 'qualityIssue', category: 'data', severity: issue.severity,
      title: issue.title, detail: [issue.entityLabel, issue.suggestedAction].filter(Boolean).join(' · '),
      href: hrefForLink(issue.link) ?? '#/quality', at: quality.evaluatedAt ?? null,
    });
  }

  const acknowledgesRisks = can(session, 'risk.acknowledge');
  for (const entry of acknowledgements?.items ?? []) {
    if (!(entry.overdue || entry.reviewDue) || !(acknowledgesRisks || entry.owner?.id === me)) continue;
    const date = entry.overdue ? entry.dueDate : entry.nextReviewDate;
    items.push({
      id: `acknowledgement:${entry.id}:${entry.overdue ? 'overdue' : 'review'}:${date}`, kind: entry.overdue ? 'riskOverdue' : 'riskReviewDue',
      category: 'risks', severity: entry.overdue ? 'critical' : 'warning',
      vars: { entity: entry.entityLabel, owner: entry.owner?.name ?? '', date },
      href: '#/overview', at: date,
    });
  }

  for (const entry of audit?.items ?? []) {
    if (!COVERAGE_EVENTS.has(entry.actionType) || !isRecent(entry.occurredAt, now)) continue;
    const lost = entry.actionType === 'risk.critical_skill_uncovered';
    items.push({
      id: `audit:${entry.id}`, kind: 'coverageEvent', action: entry.actionType, category: lost ? 'risks' : 'updates',
      severity: lost ? 'critical' : 'info', detail: entry.summary, href: '#/audit', at: entry.occurredAt,
    });
  }

  return items;
}

function normalize(stored) {
  const read = stored && typeof stored.read === 'object' && !Array.isArray(stored.read) ? stored.read : {};
  const muted = Array.isArray(stored?.muted) ? stored.muted.filter((category) => NOTIFICATION_CATEGORIES.includes(category)) : [];
  return { read, muted };
}

export function useNotifications(session) {
  const storageKey = `keystone.notifications.${session.user.id}`;
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [marks, setMarks] = useState(() => normalize(readStored(storageKey, {})));
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  const readsChanges = can(session, 'changes.submit', 'changes.review.people', 'changes.review.planning');
  const readsQuality = can(session, 'dataQuality.read.org', 'dataQuality.read.team');
  const readsRisk = can(session, 'risk.read.org', 'risk.read.team');
  const readsAudit = can(session, 'audit.read');

  useEffect(() => {
    let live = true;
    Promise.all([
      optional(true, () => keystoneApi.suggestions()),
      optional(readsChanges, () => keystoneApi.changeRequests({})),
      optional(readsQuality, () => keystoneApi.dataQuality({ status: 'open' })),
      optional(readsRisk, () => keystoneApi.acknowledgements('active')),
      optional(readsAudit, () => keystoneApi.auditLog({ highSignal: 'true', pageSize: 25 })),
    ]).then(([suggestions, changes, quality, acknowledgements, audit]) => {
      if (!live) return;
      setItems(buildNotifications({ session, suggestions, changes, quality, acknowledgements, audit }));
      setFailed([suggestions, changes, quality, acknowledgements, audit].every((result) => result === null));
      setUpdatedAt(new Date().toISOString());
    });
    return () => { live = false; };
  }, [session, attempt, readsChanges, readsQuality, readsRisk, readsAudit]);

  // Poll while the tab is open, and catch up as soon as a hidden tab becomes visible again.
  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    writeStored(storageKey, marks);
  }, [storageKey, marks]);

  const markRead = useCallback((ids) => setMarks((current) => {
    const stamp = new Date().toISOString();
    const read = { ...current.read };
    for (const id of [].concat(ids)) read[id] ??= stamp;
    const newest = Object.entries(read).sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX_READ_MARKS);
    return { ...current, read: Object.fromEntries(newest) };
  }), []);

  const markUnread = useCallback((id) => setMarks((current) => {
    const read = { ...current.read };
    delete read[id];
    return { ...current, read };
  }), []);

  const toggleMuted = useCallback((category) => setMarks((current) => ({
    ...current,
    muted: current.muted.includes(category) ? current.muted.filter((entry) => entry !== category) : [...current.muted, category],
  })), []);

  const visible = useMemo(() => (items ?? [])
    .filter((item) => !marks.muted.includes(item.category))
    .map((item) => ({ ...item, read: Boolean(marks.read[item.id]) }))
    .sort((a, b) => Number(a.read) - Number(b.read)
      || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      || String(b.at ?? '').localeCompare(String(a.at ?? ''))), [items, marks]);

  return {
    loading: items === null,
    failed,
    updatedAt,
    items: visible,
    unreadCount: visible.filter((item) => !item.read).length,
    muted: marks.muted,
    markRead,
    markUnread,
    toggleMuted,
    refresh,
  };
}
