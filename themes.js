// Background themes: a plain dark one, two colour ones, and stills from well-known films (TMDB backdrops).
export const FILMS = [
  { id: 693134, title: "Dune: Part Two" }, { id: 157336, title: "Interstellar" }, { id: 335984, title: "Blade Runner 2049" },
  { id: 313369, title: "La La Land" }, { id: 76341, title: "Mad Max: Fury Road" }, { id: 120467, title: "The Grand Budapest Hotel" },
  { id: 129, title: "Spirited Away" }, { id: 27205, title: "Inception" }, { id: 238, title: "The Godfather" },
  { id: 120, title: "The Lord of the Rings" }, { id: 603, title: "The Matrix" }, { id: 496243, title: "Parasite" },
];
export const PLAIN = [
  { key: "dark", title: "Dark", css: "#101317" },
  { key: "midnight", title: "Midnight blue", css: "radial-gradient(1200px 700px at 80% -10%,#1d3a5c 0,transparent 60%),radial-gradient(900px 600px at 0% 100%,#132a3d 0,transparent 55%),#0d1520" },
  { key: "bordeaux", title: "Bordeaux", css: "radial-gradient(1200px 700px at 80% -10%,#4a1622 0,transparent 60%),radial-gradient(900px 600px at 0% 100%,#2a1018 0,transparent 55%),#140b0e" },
  { key: "sunset", title: "Golden hour", css: "radial-gradient(1200px 700px at 70% -10%,#5a3a12 0,transparent 60%),radial-gradient(900px 600px at 0% 100%,#3a1c22 0,transparent 55%),#15100c" },
];
export const validPath = (p) => typeof p === "string" && /^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(p);
