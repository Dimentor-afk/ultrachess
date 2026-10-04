import { useMemo } from 'react';
import type { MatchFinish, PvpState } from '../api/client';
import { captureFxById } from '../economy/captureFx';
import type { Action } from '../engine/match';
import type { FxName } from './fxSprites';
import { Game } from './LazyGame';
import type { RemoteGame } from './MatchPage';
import { useSession } from './state';
import { t } from '../i18n';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The address of a game: the opponent comes back to it, anyone else watches. */
export function gameUrl(id: string): string {
  return `${location.origin}${location.pathname}#/game/${id}`;
}

/**
 * A game with people: a friend match, a player-ladder game, or someone's game
 * you watch. On the server the views come over WebSocket (with HTTP as the
 * fallback while it reconnects); the browser demo polls.
 */
export function PvpGame({ pvp, onExit, onRematch }: { pvp: PvpState; onExit: () => void; onRematch?: () => void }) {
  const s = useSession();
  const id = pvp.id;
  const remote = useMemo<RemoteGame>(() => {
    const live = s.api.live;
    return {
      you: pvp.color,
      white: pvp.white,
      black: pvp.black,
      ranked: pvp.ranked,
      shareUrl: gameUrl(id),
      subscribe: (cb) => {
        let stop = false;
        const off = live?.watch(id, ({ game, watchers }) => cb({ view: game.view, watchers }));
        // Polling: always in the demo; on the server only while the live connection is down.
        const poll = async () => {
          if (stop || document.hidden || (live && live.state === 'online')) return;
          try {
            const g = await s.api.pvpState(id);
            if (!stop) cb({ view: g.view, watchers: 0 });
          } catch {
            // Offline: next time.
          }
        };
        const t = setInterval(poll, live ? 3000 : 1500);
        return () => {
          stop = true;
          clearInterval(t);
          off?.();
        };
      },
      fetch: async () => (await s.api.pvpState(id)).view,
      send: async (action: Action, v: string) => {
        if (live) {
          try {
            return (await live.act(id, action, v)).game.view;
          } catch (e) {
            // Not connected right now: the same request over HTTP.
            if (!(e instanceof TypeError)) throw e;
          }
        }
        return (await s.api.pvpAction(id, action, v)).view;
      },
      resign: async () => {
        if (live) {
          try {
            return (await live.resign(id)).game.view;
          } catch (e) {
            if (!(e instanceof TypeError)) throw e;
          }
        }
        return (await s.api.pvpResign(id)).view;
      },
      claim: pvp.ranked && pvp.color
        ? async () => {
            if (live) {
              try {
                return (await live.claim(id)).game.view;
              } catch (e) {
                if (!(e instanceof TypeError)) throw e;
              }
            }
            return (await s.api.pvpClaim(id)).view;
          }
        : undefined,
      onStatus: live ? (cb) => live.onStatus(cb) : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Player-ladder games: the server settles both players; fetch what changed for us.
  const onFinish =
    pvp.ranked && pvp.color
      ? async (): Promise<MatchFinish> => {
          for (let i = 0; i < 12; i++) {
            const st = await s.api.pvpState(id);
            if (st.ladder) {
              const profile = await s.api.me();
              if (profile) s.setProfile(profile);
              s.setPacks(await s.api.packs());
              const l = st.ladder;
              return {
                outcome: l.trophiesDelta > 0 ? 'win' : l.trophiesDelta < 0 ? 'loss' : 'draw',
                reason: '',
                trophiesDelta: l.trophiesDelta,
                goldDelta: l.goldDelta,
                reward: l.reward,
                rewardSkipped: l.rewardSkipped,
                leagueUps: l.leagueUps,
                ladder: 'pvp',
                trial: st.trial,
                achievements: st.achievements,
                profile: profile ?? s.profile,
              };
            }
            await sleep(700);
          }
          throw new Error(t('Не вдалося отримати результат — він з’явиться в історії.'));
        }
      : undefined;

  // You play from your side; a spectator sees white at the bottom.
  const side = pvp.color ?? 'w';
  const mine = side === 'w' ? pvp.whiteDeck : pvp.blackDeck;
  const theirs = side === 'w' ? pvp.blackDeck : pvp.whiteDeck;
  const bottom = side === 'w' ? pvp.white : pvp.black;
  const spectator = pvp.color === null;
  return (
    <Game
      key={pvp.id}
      start={{ matchId: pvp.id, ranked: pvp.ranked, view: pvp.view, color: side, botLevel: 0, playerDeck: mine, botDeck: theirs }}
      playerName={spectator ? bottom.name : s.profile.name}
      playerAvatar={spectator ? bottom.avatar : s.profile.avatar}
      playerTitle={spectator ? bottom.title : s.profile.title}
      trophies={spectator ? bottom.trophies : s.profile.trophies}
      remote={remote}
      onFinish={onFinish}
      onRematch={onRematch}
      captureFx={{
        w: captureFxById(pvp.captureFx.w).sprite as FxName,
        b: captureFxById(pvp.captureFx.b).sprite as FxName,
      }}
      onExit={onExit}
    />
  );
}
