const TILE_PROVIDERS = {
  satellite: {
    buildUrl: ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
  street: {
    buildUrl: ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
  },
  osm: {
    buildUrl: ({ z, x, y }) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
};

function parseInteger(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const provider = String(searchParams.get("provider") || "street").trim().toLowerCase();
  const z = parseInteger(searchParams.get("z"));
  const x = parseInteger(searchParams.get("x"));
  const y = parseInteger(searchParams.get("y"));

  if (!TILE_PROVIDERS[provider] || z === null || x === null || y === null) {
    return new Response("INVALID_TILE_REQUEST", { status: 400 });
  }

  const targetUrl = TILE_PROVIDERS[provider].buildUrl({ z, x, y });

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": "TD-One-ERP/1.0 map-tile-proxy",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      next: { revalidate: 86400 },
    });

    if (!upstream.ok) {
      return new Response("TILE_FETCH_FAILED", { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const buffer = await upstream.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("TILE_FETCH_FAILED", { status: 502 });
  }
}