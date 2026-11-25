// Plain QA route data. The final controller receipt must match every station/via.
// These are normal walking goals, never game commands or injected positions.
const station=(direction,feet,via=[])=>({direction,feet,via});
export const P0_C_LANDMARKS={
  post:{id:'post',target:[2,17.5,-235],
    stations:[station('N',[2,-214]),station('NE',[18,-219]),station('E',[23,-235]),
      station('SE',[18,-251]),station('S',[2,-256]),station('SW',[-14,-251]),
      station('W',[-19,-235]),station('NW',[-14,-219])],returnToFirst:[[2,-214]]},
  forest:{id:'forest',target:[-170,43,-20.25],
    stations:[station('S',[-170,-49.5]),station('SE',[-150,-40]),
      station('E',[-154,-20],[[-164,-34],[-164,-20]]),station('NE',[-158,-7]),
      station('N',[-170,-4]),station('NW',[-182,-7]),station('W',[-186,-20]),
      station('SW',[-190,-40])],returnToFirst:[[-170,-49.5]]},
  town:{id:'town',target:[155,28,20],
    stations:[station('S',[155,-6]),station('SE',[177,0],[[166,-6]]),station('E',[181,20]),
      station('NE',[176,38],[[181,26],[176,26],[172,27],[168,29],[166,31],[174,39]]),
      station('N',[155,40],[[174,39],[166,31],[155,20],[155,35]]),
      station('NW',[134,38]),station('W',[127,20]),station('SW',[134,0])],returnToFirst:[[155,-6]]},
  ridge:{id:'ridge',target:[0,100,235],
    stations:[station('S',[0,217],[[20,226]]),station('SE',[15,220]),station('E',[19,235]),
      station('NE',[15,250]),station('N',[0,254]),station('NW',[-15,250]),
      station('W',[-19,235]),station('SW',[-15,220])],returnToFirst:[[0,217]]},
};
export const P0_C_VIEWS={
  forest:{feet:[-170,-49.5],target:[-170,46.5,-25]},
  town:{feet:[155,-3],target:[155,29,10]},
  valleyRoad:{feet:[64,204],target:[48.568,61.842,108.132],label:'山脊邮路远眺'},
};
export const P0_C_ROUTES={
  postEntry:[[9.75,-226],[0,-220]],postExit:[[0,-220]],
  forestEntry:[[0,-220],[-35,-192],[-65,-154],[-102,-120],[-142,-95],[-170,-70],[-170,-49.5]],
  townEntry:[[0,-220],[38,-185],[75,-143],[92,-100],[128,-60],[155,-19],[155,-6]],
  crank:[[148,-2],[148,8.8]],townPhotoApproach:[[148,-2],[155,-3]],
  townHighEntry:[[155,5],[155,20]],
  valleyRoad:[[194,59],[216,109],[171,135],[126,178],[64,204]],
  ridgeOuterEntry:[[20,226]],
};
