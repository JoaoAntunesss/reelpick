// Background themes: a plain dark one, two colour ones, and stills from well-known films (TMDB backdrops).
export const FILMS = [
  // movies
  { id: 693134, title: "Dune: Part Two" }, { id: 157336, title: "Interstellar" }, { id: 335984, title: "Blade Runner 2049" },
  { id: 313369, title: "La La Land" }, { id: 76341, title: "Mad Max: Fury Road" }, { id: 120467, title: "The Grand Budapest Hotel" },
  { id: 129, title: "Spirited Away" }, { id: 27205, title: "Inception" }, { id: 238, title: "The Godfather" },
  { id: 120, title: "The Lord of the Rings" }, { id: 603, title: "The Matrix" }, { id: 496243, title: "Parasite" },
  { id: 155, title: "The Dark Knight" }, { id: 680, title: "Pulp Fiction" }, { id: 872585, title: "Oppenheimer" },
  { id: 19995, title: "Avatar" }, { id: 98, title: "Gladiator" }, { id: 329, title: "Jurassic Park" },
  { id: 105, title: "Back to the Future" }, { id: 11, title: "Star Wars" }, { id: 194, title: "Amélie" },
  { id: 545611, title: "Everything Everywhere All at Once" }, { id: 361743, title: "Top Gun: Maverick" }, { id: 244786, title: "Whiplash" },
  // series
  { id: 1396, type: "tv", title: "Breaking Bad" }, { id: 1399, type: "tv", title: "Game of Thrones" }, { id: 66732, type: "tv", title: "Stranger Things" },
  { id: 100088, type: "tv", title: "The Last of Us" }, { id: 76331, type: "tv", title: "Succession" }, { id: 95396, type: "tv", title: "Severance" },
  { id: 136315, type: "tv", title: "The Bear" }, { id: 70523, type: "tv", title: "Dark" }, { id: 87108, type: "tv", title: "Chernobyl" },
  { id: 60574, type: "tv", title: "Peaky Blinders" }, { id: 82856, type: "tv", title: "The Mandalorian" }, { id: 94605, type: "tv", title: "Arcane" },
  { id: 126308, type: "tv", title: "Shōgun" }, { id: 94997, type: "tv", title: "House of the Dragon" }, { id: 65494, type: "tv", title: "The Crown" },
  { id: 1668, type: "tv", title: "Friends" }, { id: 71912, type: "tv", title: "The Witcher" }, { id: 93405, type: "tv", title: "Squid Game" },
];
export const cacheKey = (f) => (f.type === "tv" ? "tv" + f.id : String(f.id));
export const PLAIN = [
  { key: "dark", title: "Dark", css: "#101317" },
  { key: "midnight", title: "Midnight blue", css: "radial-gradient(1200px 700px at 80% -10%,#1d3a5c 0,transparent 60%),radial-gradient(900px 600px at 0% 100%,#132a3d 0,transparent 55%),#0d1520" },
  { key: "bordeaux", title: "Bordeaux", css: "radial-gradient(1200px 700px at 80% -10%,#4a1622 0,transparent 60%),radial-gradient(900px 600px at 0% 100%,#2a1018 0,transparent 55%),#140b0e" },
  { key: "sunset", title: "Golden hour", css: "radial-gradient(1200px 700px at 70% -10%,#5a3a12 0,transparent 60%),radial-gradient(900px 600px at 0% 100%,#3a1c22 0,transparent 55%),#15100c" },
];
export const validPath = (p) => typeof p === "string" && /^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(p);
