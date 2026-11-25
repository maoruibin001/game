// Authored physical route only; X/Z are desired walking destinations, never teleport values.
// Root must bind these scripts to the frozen final candidate before starting the one GPU owner.
export const P0_ROUTE = {
  town:[[0,-220],[38,-185],[75,-143],[92,-100],[128,-60],[155,-19],[155,-6]],
  forest:[[0,-220],[-35,-192],[-65,-154],[-102,-120],[-142,-95],[-170,-70],[-170,-49.5]],
  // This proven main road return avoids unverified shortcuts and zipline-specific changes.
  forestReturn:[[-170,-70],[-142,-95],[-102,-120],[-65,-154],[-35,-192],[0,-220]],
  // owner01 reached the visible E prompt but [148,11] crossed the real crank.
  // Stop on its south side and interact normally; retain all gameplay collision.
  lever:[[148,-2],[148,8.8]],
  gateToPhoto:[[148,-2],[155,-6]],
  mailbox:[[155,5],[157.75,5]],
  // Safety author confirms the NE town-high turn bypasses the still-closed bridge.
  eastBack:[[155,20],[166,31],[168,29],[172,27],[176,26]],
  eastBackReturn:[[172,27],[168,29],[166,31],[155,20]],
  eastBackRiskLoop:[[170.5,25.5],[173,31.5],[173,32.01],[177,32.5],[177,33.01],[176,26]],
  ridge:[[194,59],[216,109],[171,135],[126,178],[64,204],[20,226],[15,226],[15,235],[0,235]],
  forestPhoto:{feet:[-171,-52],target:[-175.5,45,-25]},
  townPhoto:{feet:[155,-6],target:[155,29,10]},
  townSidePhoto:{feet:[175,19],target:[170,28,21]},
  townBackPhoto:{feet:[176,29],target:[165.75,28.2,24.8]},
  ridgePhoto:{feet:[0,235],target:[0,35,-100]},
};
// UI author must confirm these coordinates / focus order against final layout.
export const P0_RECOVERY_UI = {
  confirmed:true,
  coordinateEvidence:'production/sprint-p0-20261116/ui-component/RESULT.json',
  hud:[1658,56], // Actual isolated component geometry; owner behavior is still unverified.
  pauseTabs:5, // UI author confirmed DOM focus order; no test queries DOM at runtime.
};
