import { r } from "../../models";
import { groupCannedResponses } from "../../api/lib/utils";

// Datastructure:
// * regular GET/SET with JSON ordered list of the objects {id,title,text}
// * keyed by campaignId-userId pairs -- userId is '' for global campaign records
// Requirements:
// * needs an order
// * needs to get by campaignId-userId pairs

const cacheKey = (campaignId, userId) =>
  `${process.env.CACHE_PREFIX || ""}canned-${campaignId}-${userId || ""}`;

const cannedResponseCache = {
  clearQuery: async ({ campaignId, userId }) => {
    if (r.redis) {
      await r.redis.delAsync(cacheKey(campaignId, userId));
    }
  },
  query: async ({ campaignId, userId }) => {
    if (r.redis) {
      const cannedData = await r.redis.getAsync(cacheKey(campaignId, userId));
      if (cannedData) {
        return JSON.parse(cannedData);
      }
    }
    // get canned responses with tag ids
    const dbResult = await r
      .knex("canned_response")
      .leftJoin(
        "tag_canned_response",
        "canned_response.id",
        "tag_canned_response.canned_response_id"
      )
      .where("campaign_id", campaignId)
      .whereNull("user_id")
      .select("canned_response.*", "tag_canned_response.tag_id")
      .orderBy("title", "id");
    // group each canned response with its array of tag ids
    const grouped = groupCannedResponses(dbResult);
    if (r.redis) {
      const cacheData = grouped.map(cannedRes => ({
        id: cannedRes.id,
        title: cannedRes.title,
        text: cannedRes.text,
        user_id: cannedRes.user_id,
        tagIds: cannedRes.tagIds
      }));
      await r.redis
        .multi()
        .set(cacheKey(campaignId, userId), JSON.stringify(cacheData))
        .expire(cacheKey(campaignId, userId), 43200) // 12 hours
        .execAsync();
    }
    return grouped;
  }
};

export default cannedResponseCache;
