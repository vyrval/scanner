// Environnement : la préproduction est servie sous /staging/ (même domaine que la prod).
// Ses données (localStorage) et son cache hors ligne sont séparés de ceux de la prod.
export const STAGING = location.pathname.includes("/staging/");
export const NS = STAGING ? "carnet-staging" : "carnet";
