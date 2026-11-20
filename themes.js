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
  { id: 278, title: "The Shawshank Redemption" }, { id: 550, title: "Fight Club" }, { id: 13, title: "Forrest Gump" },
  { id: 8587, title: "The Lion King" }, { id: 862, title: "Toy Story" }, { id: 569094, title: "Spider-Man: Across the Spider-Verse" },
  { id: 299534, title: "Avengers: Endgame" }, { id: 475557, title: "Joker" }, { id: 346698, title: "Barbie" },
  { id: 414906, title: "The Batman" }, { id: 354912, title: "Coco" }, { id: 14160, title: "Up" },
  { id: 671, title: "Harry Potter" }, { id: 597, title: "Titanic" }, { id: 694, title: "The Shining" },
  { id: 62, title: "2001: A Space Odyssey" }, { id: 348, title: "Alien" }, { id: 769, title: "Goodfellas" },
  { id: 37799, title: "The Social Network" }, { id: 64690, title: "Drive" }, { id: 329865, title: "Arrival" },
  { id: 152601, title: "Her" }, { id: 372058, title: "Your Name" }, { id: 128, title: "Princess Mononoke" },
  { id: 24, title: "Kill Bill" }, { id: 16869, title: "Inglourious Basterds" }, { id: 281957, title: "The Revenant" },
  { id: 76600, title: "Avatar: The Way of Water" },
  // series
  { id: 1396, type: "tv", title: "Breaking Bad" }, { id: 1399, type: "tv", title: "Game of Thrones" }, { id: 66732, type: "tv", title: "Stranger Things" },
  { id: 100088, type: "tv", title: "The Last of Us" }, { id: 76331, type: "tv", title: "Succession" }, { id: 95396, type: "tv", title: "Severance" },
  { id: 136315, type: "tv", title: "The Bear" }, { id: 70523, type: "tv", title: "Dark" }, { id: 87108, type: "tv", title: "Chernobyl" },
  { id: 60574, type: "tv", title: "Peaky Blinders" }, { id: 82856, type: "tv", title: "The Mandalorian" }, { id: 94605, type: "tv", title: "Arcane" },
  { id: 126308, type: "tv", title: "Shōgun" }, { id: 94997, type: "tv", title: "House of the Dragon" }, { id: 65494, type: "tv", title: "The Crown" },
  { id: 1668, type: "tv", title: "Friends" }, { id: 2316, type: "tv", title: "The Office" }, { id: 1398, type: "tv", title: "The Sopranos" },
  { id: 1438, type: "tv", title: "The Wire" }, { id: 19885, type: "tv", title: "Sherlock" }, { id: 60059, type: "tv", title: "Better Call Saul" },
  { id: 46648, type: "tv", title: "True Detective" }, { id: 60622, type: "tv", title: "Fargo" }, { id: 62560, type: "tv", title: "Mr. Robot" },
  { id: 63247, type: "tv", title: "Westworld" }, { id: 76479, type: "tv", title: "The Boys" }, { id: 119051, type: "tv", title: "Wednesday" },
  { id: 71446, type: "tv", title: "Money Heist" }, { id: 63351, type: "tv", title: "Narcos" }, { id: 42009, type: "tv", title: "Black Mirror" },
  { id: 1920, type: "tv", title: "Twin Peaks" }, { id: 85552, type: "tv", title: "Euphoria" }, { id: 97546, type: "tv", title: "Ted Lasso" },
  { id: 106379, type: "tv", title: "Fallout" }, { id: 83867, type: "tv", title: "Andor" }, { id: 456, type: "tv", title: "The Simpsons" },
  { id: 60625, type: "tv", title: "Rick and Morty" }, { id: 4607, type: "tv", title: "Lost" }, { id: 71912, type: "tv", title: "The Witcher" }, { id: 93405, type: "tv", title: "Squid Game" },
];
export const cacheKey = (f) => (f.type === "tv" ? "tv" + f.id : String(f.id));
export const PLAIN = [
  { key: "dark", title: "Dark", css: "#101317" },
  { key: "midnight", title: "Midnight blue", css: "radial-gradient(1200px 700px at 80% -10%,#1d3a5c 0,transparent 60%),radial-gradient(900px 600px at 0% 100%,#132a3d 0,transparent 55%),#0d1520" },
  { key: "bordeaux", title: "Bordeaux", css: "radial-gradient(1200px 700px at 80% -10%,#4a1622 0,transparent 60%),radial-gradient(900px 600px at 0% 100%,#2a1018 0,transparent 55%),#140b0e" },
  { key: "sunset", title: "Golden hour", css: "radial-gradient(1200px 700px at 70% -10%,#5a3a12 0,transparent 60%),radial-gradient(900px 600px at 0% 100%,#3a1c22 0,transparent 55%),#15100c" },
];
export const validPath = (p) => typeof p === "string" && /^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(p);
