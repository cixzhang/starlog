// Prompts: quiet presentation. The prompt is a small closed loop —
// the app shows it and gets out of the way.

import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  fetchPrompts,
  type Prompt,
  type SbConfig,
} from '../lib/supabase';
import { formatLong, parseISODate } from '../lib/dates';
import { EmptyNote, ErrorNote, Loading } from '../components/ui';

const styles = stylex.create({
  list: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '24px 20px 80px',
  },
  item: {
    padding: '22px 0',
    borderBottom: '1px solid var(--sl-line)',
  },
  meta: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  date: {
    fontSize: 12.5,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--sl-ink-faint)',
  },
  flavor: {
    fontSize: 12.5,
    fontStyle: 'italic',
    color: 'var(--sl-ink-faint)',
  },
  body: {
    fontFamily: 'var(--font-heading)',
    fontSize: 21,
    fontWeight: 500,
    lineHeight: 1.55,
    color: 'var(--sl-ink)',
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
});

const FLAVOR_LABEL: Record<Prompt['flavor'], string> = {
  short: 'a quick one',
  deep: 'a deeper one',
  maker: 'a maker’s one',
  odd: 'an odd one',
};

export default function Prompts({
  cfg,
  tenantId,
}: {
  cfg: SbConfig;
  tenantId: string;
}) {
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ps = await fetchPrompts(cfg, tenantId, 14);
        if (alive) setPrompts(ps);
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : 'Couldn’t load prompts.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg, tenantId]);

  return (
    <div {...stylex.props(styles.list)}>
      {error && <ErrorNote title="The prompts didn’t load." detail={error} />}
      {!error && prompts === null && <Loading label="Gathering prompts…" />}
      {!error && prompts !== null && prompts.length === 0 && (
        <EmptyNote>
          No prompts yet.
          <br />
          They arrive with the morning.
        </EmptyNote>
      )}
      {!error &&
        prompts?.map((p) => (
          <article key={p.id} {...stylex.props(styles.item)}>
            <div {...stylex.props(styles.meta)}>
              <span {...stylex.props(styles.date)}>
                {formatLong(parseISODate(p.prompt_date))}
              </span>
              <span {...stylex.props(styles.flavor)}>
                {FLAVOR_LABEL[p.flavor]}
              </span>
            </div>
            <p {...stylex.props(styles.body)}>{p.body}</p>
          </article>
        ))}
    </div>
  );
}
