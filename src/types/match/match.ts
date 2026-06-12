import z from 'zod';
import { MatchParticipantSchema, type MatchParticipant } from './participant';
import { TeamSchema, type Team } from './team';

export const MetadataSchema = z.object({
  dataVersion: z.string(),
  matchId: z.string(),
  participants: z.array(z.string()),
}).passthrough();

export type Metadata = z.infer<typeof MetadataSchema>;

export type MatchInfo = {
  gameCreation: number;
  gameDuration: number;
  gameEndTimestamp: number;
  gameId: number;
  gameMode: string;
  gameName: string;
  gameStartTimestamp: number;
  gameType: string;
  gameVersion: string;
  mapId: number;
  platformId: string;
  queueId: number;
  tournamentCode?: string | undefined;
  endOfGameResult?: string | undefined;
  teams: Team[];
  participants: MatchParticipant[];
} & Record<string, unknown>;

export type Match = {
  metadata: Metadata;
  info: MatchInfo;
} & Record<string, unknown>;

export const MatchSchema: z.ZodType<Match> = z.object({
  metadata: MetadataSchema,
  info: z.object({
    gameCreation: z.number(),
    gameDuration: z.number(),
    gameEndTimestamp: z.number(),
    gameId: z.number(),
    gameMode: z.string(),
    gameName: z.string(),
    gameStartTimestamp: z.number(),
    gameType: z.string(),
    gameVersion: z.string(),
    mapId: z.number(),
    platformId: z.string(),
    queueId: z.number(),
    tournamentCode: z.string().optional(),
    endOfGameResult: z.string().optional(),
    teams: z.array(TeamSchema),
    participants: z.array(MatchParticipantSchema),
  }).passthrough(),
}).passthrough();
