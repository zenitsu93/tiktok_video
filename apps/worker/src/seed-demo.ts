// Creates the Like a Tattoo demo video and queues its generation (local testing).
import { newVideoSchema } from "@regie/core";
import { closeDb, createVideo, getDb } from "@regie/db";
import { enqueue, JOBS, queue } from "@regie/server";

const input = newVideoSchema.parse({ title: process.argv[2] ?? "Like a Tattoo", artist: process.argv[3] ?? "Sade", angle: "" });
const row = await createVideo(getDb(), { ...input, cover: null, voiceTrack: null, beats: [], assets: {}, sources: [] });
await enqueue(JOBS.generate, { videoId: row.id });
console.log(row.id);
await (await queue()).stop({ graceful: false });
await closeDb();
