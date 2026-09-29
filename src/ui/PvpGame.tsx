import { useMemo } from 'react';
import type { MatchFinish, PvpState } from '../api/client';
import { captureFxById } from '../economy/captureFx';
import type { Action } from '../engine/match';
import type { FxName } from './fxSprites';
import { Game, type RemoteGame } from './MatchPage';
import { useSession } from './state';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A game against another player: a friend match or a player-ladder game. */
export function PvpGame({ pvp, onExit, onRematch }: { pvp: PvpState; onExit: () => void; onRematch?: () => void }) {
  const s = useSession();
  const id = pvp.id;
  const remote = useMemo<RemoteGame>(
    () => ({
      opponentName: pvp.opponent.name,
      opponentAvatar: pvp.opponent.avatar,
      initialActions: pvp.actions,
      resignedBy: pvp.resignedBy,
      ranked: pvp.ranked,
      poll: async () => {
        const st = await s.api.pvpState(id);
        return { actions: st.actions, resignedBy: st.resignedBy };
      },
      send: async (action: Action, expected: number) => {
        await s.api.pvpAction(id, action, expected);
      },
      resign: async () => {
        await s.api.pvpResign(id);
      },
      claim: pvp.ranked
        ? async () => {
            await s.api.pvpClaim(id);
          }
        : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  // Player-ladder games: the server settles both players; fetch what changed for us.
  const onFinish = pvp.ranked
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
              trial: null,
              profile: profile ?? s.profile,
            };
          }
          await sleep(700);
        }
        throw new Error('Не вдалося отримати результат — він з’явиться в історії.');
      }
    : undefined;

  const mine = pvp.color === 'w' ? pvp.whiteDeck : pvp.blackDeck;
  const theirs = pvp.color === 'w' ? pvp.blackDeck : pvp.whiteDeck;
  return (
    <Game
      key={pvp.id}
      start={{ matchId: pvp.id, ranked: pvp.ranked, color: pvp.color, botLevel: 0, playerDeck: mine, botDeck: theirs }}
      playerName={s.profile.name}
      playerAvatar={s.profile.avatar}
      trophies={s.profile.trophies}
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
