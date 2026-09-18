const STATIONS = {
  vr: { placeId: '3025', target: 'ROMA TERMINI' },
  rv: { placeId: '2416', target: 'VERONA PORTA NUOVA' }
};

function decode(s='') {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function handler(event) {
  const direction = event.queryStringParameters?.direction === 'rv' ? 'rv' : 'vr';
  const { placeId, target } = STATIONS[direction];
  const url = `https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?arrivals=false&placeId=${placeId}`;

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (TumoreTour; timetable display)',
        'accept-language': 'it-IT,it;q=0.9'
      }
    });

    if (!response.ok) throw new Error(`RFI ${response.status}`);

    const html = await response.text();
    const rows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(m => m[0]);
    const trains = [];

    for (const row of rows) {
      const rowText = decode(row);

      if (!rowText.toUpperCase().includes(target)) continue;

      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(m => decode(m[1]));

      if (cells.length < 6) continue;

      const timeIndex = cells.findIndex(x => /^\d{1,2}:\d{2}$/.test(x));

      if (timeIndex < 1) continue;

      const time = cells[timeIndex];
      const before = cells.slice(0, timeIndex);

      const number = [...before]
        .reverse()
        .find(x => /^\d{1,6}[A-Z]?$/.test(x)) || '';

      if (!number) continue;

      const delayRaw = cells[timeIndex + 1] || '';
      const platformRaw = cells[timeIndex + 2] || '';

      const delayMatch = delayRaw.match(/-?\d+/);
      const delay = delayMatch ? Number(delayMatch[0]) : 0;

      const platformMatch = platformRaw.match(/[A-Z]?\d+[A-Z]?/i);
      const platform = platformMatch ? platformMatch[0] : '—';

      const targetEsc = target
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s+');

      const arrivalMatch = rowText.match(
        new RegExp(`${targetEsc}\\s*\\((\\d{1,2}:\\d{2})\\)`, 'i')
      );

      trains.push({
        number,
        time,
        delay: Math.max(0, delay),
        platform,
        arrival: arrivalMatch?.[1] || ''
      });
    }

    const unique = [
      ...new Map(
        trains.map(t => [`${t.number}-${t.time}`, t])
      ).values()
    ];

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      },
      body: JSON.stringify({
        ok: true,
        direction,
        trains: unique
      })
    };

  } catch (error) {
    return {
      statusCode: 502,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      },
      body: JSON.stringify({
        ok: false,
        trains: [],
        error: String(error?.message || error)
      })
    };
  }
}
