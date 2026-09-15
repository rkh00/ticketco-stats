(async () => {
  // ==========================================
  // FINN EVENT ID AUTOMATISK FRA URL
  // ==========================================

  const eventMatch = location.pathname.match(/\/events\/(\d+)/i);

  if (!eventMatch) {
    throw new Error(
      "Fant ikke Event ID i URL-en. " +
      "Åpne TicketCo-siden for arrangementet først."
    );
  }

  const EVENT_ID = eventMatch[1];

  console.clear();
  console.log(`TicketCo Event ID: ${EVENT_ID}`);
  console.log(`URL: ${location.href}`);

  // ------------------------------------------
  // Gjør feltnavn penere
  // ------------------------------------------

  function niceName(name) {
    if (!name) return "";

    return name
      .replace(/^felt-/i, "Felt-")
      .replace(/^hcp-/i, "HCP-")
      .replace(/^vip-/i, "VIP-")
      .toUpperCase()
      .replace("FELT-", "Felt-");
  }

  // ==========================================
  // HENT HOVEDSIDEN
  // ==========================================

  const mainURL =
    `/no/nb/events/${EVENT_ID}/seating_arrangement`;

  const response = await fetch(mainURL, {
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw new Error(
      `Kunne ikke hente event ${EVENT_ID}: HTTP ${response.status}`
    );
  }

  const html = await response.text();

  // ==========================================
  // FINN ALLE SECTION-ID-ER
  // ==========================================

  const sections = new Map();

  const regex =
    /<[^>]+(?:xlink:href|href)=["'][^"']*sections\/(\d+)["'][^>]*>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const tag = match[0];
    const id = match[1];

    const titleMatch =
      tag.match(/xlink:title=["']([^"']+)["']/i) ||
      tag.match(/\btitle=["']([^"']+)["']/i);

    const name = titleMatch
      ? niceName(titleMatch[1])
      : `Section-${id}`;

    if (!sections.has(id)) {
      sections.set(id, {
        id,
        name
      });
    }
  }

  console.log(
    `Fant ${sections.size} seksjoner. Henter setedata...`
  );

  // ==========================================
  // HENT SECTION-DATA
  // ==========================================

  const results = [];

  for (const section of sections.values()) {
    try {
      const url =
        `/no/nb/events/${EVENT_ID}` +
        `/seating_arrangement/sections/${section.id}.json`;

      const r = await fetch(url, {
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });

      if (!r.ok) {
        console.warn(
          `Kunne ikke hente ${section.name}: HTTP ${r.status}`
        );
        continue;
      }

      const data = await r.json();
      const sa = data?.seating_arrangements;

      if (!sa) continue;

      const seats =
        Array.isArray(sa.seats)
          ? sa.seats
          : [];

      const areas =
        Array.isArray(sa.areas)
          ? sa.areas
          : [];

      // ======================================
      // HOPP OVER STÅFELT
      // ======================================

      if (seats.length === 0 && areas.length > 0) {
        console.log(
          `Hopper over ståfelt: ${
            sa.section_name || section.name
          } (${sa.section_amount || "ukjent"} plasser)`
        );

        continue;
      }

      // ======================================
      // TELL STATUS
      // ======================================

      let sold = 0;
      let available = 0;
      let reserved = 0;
      let other = 0;

      for (const seat of seats) {
        switch (seat.status) {
          case "sold":
            sold++;
            break;

          case "available":
            available++;
            break;

          case "reserved":
            reserved++;
            break;

          default:
            other++;
        }
      }

      const capacity =
        Number(sa.section_amount) ||
        seats.length;

      results.push({
        section:
          sa.section_name ||
          section.name,

        id:
          section.id,

        type:
          "SEATED",

        capacity,

        seats:
          seats.length,

        sold,

        available,

        reserved,

        area_status:
          null,

        area_uuid:
          null
      });

    } catch (error) {
      console.error(
        `Feil på ${section.name}:`,
        error
      );
    }

    await new Promise(resolve =>
      setTimeout(resolve, 75)
    );
  }

  // ==========================================
  // BEREGN TOTALER
  // ==========================================

  const totals = results.reduce(
    (total, row) => {
      total.capacity += row.capacity;
      total.seats += row.seats;
      total.sold += row.sold;
      total.available += row.available;
      total.reserved += row.reserved;

      return total;
    },
    {
      capacity: 0,
      seats: 0,
      sold: 0,
      available: 0,
      reserved: 0
    }
  );

  const soldPercent =
    totals.capacity > 0
      ? (
          (totals.sold / totals.capacity) *
          100
        ).toFixed(1) + "%"
      : "0%";

  // ==========================================
  // LEGG TOTALT NEDERST I SAMME TABELL
  // ==========================================

  const tableResults = [
    ...results,
    {
      section: "TOTALT",
      id: "",
      type: "",
      capacity: totals.capacity,
      seats: totals.seats,
      sold: totals.sold,
      available: totals.available,
      reserved: totals.reserved,
      area_status: "",
      area_uuid: ""
    }
  ];

  // ==========================================
  // VIS TABELL
  // ==========================================

  console.log(
    `\nEVENT ${EVENT_ID} - NUMMERERTE FELT`
  );

  console.table(tableResults);

  console.log(
    `Solgt: ${totals.sold} / ${totals.capacity} (${soldPercent})`
  );

  // ==========================================
  // LAGRE RESULTATENE
  // ==========================================

  window.ticketcoEventID = EVENT_ID;
  window.ticketcoResults = results;
  window.ticketcoTableResults = tableResults;
  window.ticketcoTotals = totals;

  console.log("\nFerdig.");
  console.log(`Event ID: ${EVENT_ID}`);
})();
