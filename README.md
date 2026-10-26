# ReelPick

A slot machine for movies and series. Choose type, genres, the streaming platforms you have and a style, pull the lever,
and the reel slows down on a random title that matches. Static page, no build step, free.

## Run

    python3 -m http.server 8810      # then open http://127.0.0.1:8810

It starts in **demo mode** (a small built-in sample). For every movie and series, add a free TMDB key:
create an account at themoviedb.org, Settings > API, and paste the *API Read Access Token* in "TMDB key…" (footer).
The key stays in your browser (localStorage) and is sent only to api.themoviedb.org.

## Filters
Movies / Series / Both, genres (any or all), your platforms for your country (flatrate only, via TMDB/JustWatch data),
styles (crowd pleasers, hidden gems, critically acclaimed, classics, recent, short), minimum rating.
"Seen it" titles are remembered locally and skipped.

## How a spin works
One discover request finds how many pages match, a random page is fetched, and one title is picked from it.
Titles with no poster are skipped. Pages beyond TMDB's 500-page limit are never reached.

## Tests
    node --test tests/

## Credits
This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data provided by JustWatch via TMDB.
