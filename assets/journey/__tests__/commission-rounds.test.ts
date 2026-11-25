import { describe, expect, it } from 'vitest';
import { createJourney, reduceJourney } from '../journey.ts';
import { claimCommissionRound, commissionReward, eligibleCommissionSites, startNextStoryRound, STORY_COMMISSIONS, submitCommission } from '../commission-rounds.ts';
import { commissionSite, commissionSiteIds } from '../commission-sites.ts';
import { FLOWER_ORDER } from '../flower-catalog.ts';
import { SCENIC_SPOTS } from '../scenic-spots.ts';
import { restoreJourney, serializeJourney } from '../save.ts';
import type { Photo, Pose } from '../types.ts';

const spawn: Pose = { position:[0,14,-235], yaw:0, pitch:.13, area:'post' };
const begin = (seed: number) => reduceJourney(createJourney(spawn,{weatherSeed:seed}),{type:'start'}).state;
const picture = (sequence: number, extra: Partial<Photo> = {}): Photo => ({
  id:`photo-${sequence}`, sequence, title:'实拍构图记录', area:'post', pose:spawn,
  capturedAt:1, playSeconds:40, thumbnail:null, matchedCards:[], memoryCandidates:[], tutorialMatch:false, caption:'',
  original:{key:`shanye:original:commission-${sequence}`,bytes:12000,width:1920,height:1080,mime:'image/jpeg'},
  scene:{clock:{day:1,minute:850},weather:'morning',weatherBlend:1,lens:'wide',mode:'landscape',exposure:0,pose:'look',
    camera:{position:[0,15.6,-235],forward:[0,0,1],verticalFovRadians:1,aspect:16/9},
    subject:{position:spawn.position,yaw:0,visible:false}}, ...extra,
});
function atHall(seed: number, room = false) {
  const state = begin(seed), d = state.durable;
  const forest = picture(2,{area:'forest',pose:{...spawn,area:'forest'},matchedCards:['forest']});
  const hall = picture(3,{area:'town',pose:{...spawn,area:'town'},afternoonSubject:'hall-window'});
  d.openingReply = picture(1,{openingMountains:0});
  d.replyPhotos.forest = {photo:forest,variant:'landmark',note:''};
  d.fireworks = {photo:hall,day:1,minute:850};
  d.gateOpened = true;
  d.stamps = {forest:true,town:true};
  if (room) d.sixth = {...d.sixth,tin:true,revealed:true,displayed:true};
  d.totalPhotos = 3;
  expect(startNextStoryRound(d)).toBe(true);
  return state;
}
describe('photo commissions across rounds and saves', () => {
  it('keeps the same first three topics, draws from all named map sites and excludes the unrevealed room', () => {
    const union = new Set<string>(), triplets = new Set<string>();
    expect(commissionSiteIds.slice().sort()).toEqual(SCENIC_SPOTS.map(spot=>spot.id).sort());
    expect(STORY_COMMISSIONS.map(job=>job.title)).toEqual(['给阿禾寄一座山','帮阿禾认路','替阿公补拍老窗']);
    for(let seed=1;seed<=128;seed++) {
      expect(begin(seed).durable.photoCommissions).toEqual({number:1,afterSequence:0,orders:[],seen:[]});
      const {durable:d}=atHall(seed,true);
      const ids=d.photoCommissions.orders.map(job=>job.site);
      expect(ids).toHaveLength(3);
      expect(new Set(ids.map(id=>commissionSite(id).group)).size).toBe(3);
      ids.forEach(id=>union.add(id));
      triplets.add(ids.join(','));
    }
    expect(triplets.size).toBeGreaterThan(35);
    expect([...union].sort()).toEqual(commissionSiteIds.slice().sort());
    expect(eligibleCommissionSites(atHall(4).durable)).not.toContain('sixth-room');
  });

  it('requires a newly photographed original, preserves each signature and only grants a round reward once', () => {
    let state=atHall(4), d=state.durable;
    const round=d.photoCommissions;
    const [first,second]=round.orders;
    expect(claimCommissionRound(d,2)).toBeUndefined();
    expect(submitCommission(d,2,first!.site,picture(3,{commissionSites:[first!.site]}))).toBe(false);
    expect(submitCommission(d,2,first!.site,picture(4))).toBe(false);
    expect(submitCommission(d,2,first!.site,picture(4,{original:undefined,commissionSites:[first!.site]}))).toBe(false);
    const accepted=picture(4,{commissionSites:[first!.site,second!.site]});
    expect(submitCommission(d,2,first!.site,accepted)).toBe(true);
    expect(submitCommission(d,2,second!.site,accepted)).toBe(false);
    d.film=[accepted];d.totalPhotos=4;
    state=restoreJourney(serializeJourney(state),spawn).state;
    d=state.durable;
    expect(d.photoCommissions.orders[0]?.photoId).toBe(accepted.id);
    expect(d.film[0]?.commissionSites).toEqual(accepted.commissionSites);
    const reward=commissionReward(d);
    for(const entry of d.photoCommissions.orders.slice(1)){
      expect(submitCommission(d,2,entry.site,picture(++d.totalPhotos,{commissionSites:[entry.site]}))).toBe(true);
    }
    expect(claimCommissionRound(d,2)).toBeTruthy();
    expect(d.photoCommissions).toMatchObject({number:3,previous:{number:2,reward}});
    const stock=d.flowerStock!;
    expect(stock.earned).toEqual(['gold',reward]);
    expect(stock.counts[reward]).toBe(1);
    expect(claimCommissionRound(d,2)).toBeUndefined();
    const saved=restoreJourney(serializeJourney(state),spawn).state.durable;
    expect(saved.photoCommissions).toEqual(d.photoCommissions);
    expect(saved.flowerStock).toEqual(stock);
  });

  it('adopts a pre-round save with its gold, skills and regular flower progress', () => {
    const state=atHall(312), d=state.durable;
    d.skills={run:true,jump:false};
    d.night={...d.night,fishLetter:'delivered',scarletClaimed:true};
    const old=JSON.parse(serializeJourney(state));
    delete old.journey.photoCommissions;
    const a=restoreJourney(JSON.stringify(old),spawn).state.durable;
    const b=restoreJourney(JSON.stringify(old),spawn).state.durable;
    expect(a.photoCommissions).toMatchObject({number:2,legacy:true});
    expect(a.photoCommissions).toEqual(b.photoCommissions);
    expect(a.fireworks?.photo.id).toBe(d.fireworks?.photo.id);
    expect(a.skills).toEqual(d.skills);
    expect(commissionReward(a)).toBe(FLOWER_ORDER[2]);
  });
});
