import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { JustJoinItAdapter } from "../src/sources/justjoinit.js";

describe("JustJoinItAdapter", () => {
  test("extracts offer urls and listing metadata from html", () => {
    const html = readFileSync("tests/fixtures/justjoinit-listing.html", "utf8");
    const adapter = new JustJoinItAdapter();

    const offers = adapter.parseListings(html);

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      externalId: "justjoinit:/job-offer/acme-senior-node-engineer-warszawa-nodejs",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme-senior-node-engineer-warszawa-nodejs",
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Warszawa"
    });
    expect(offers[1]?.salaryText).toBeUndefined();
  });

  test("extracts clean fields from nested listing cards without copying whole card text", () => {
    const html = `
      <main>
        <a href="/job-offer/accenture-node-js-developer-warszawa-javascript">
          <div>
            <div><span>Super offer</span></div>
            <div><h3>Node.js Developer</h3></div>
            <div><span>Undisclosed Salary</span></div>
            <div><span>Undisclosed Salary</span></div>
            <div><span>Accenture</span></div>
            <div><span>Warszawa, +3Locations</span></div>
            <div><span>22d left</span></div>
            <div>
              <span>AWS</span>
              <span>TypeScript</span>
              <span>Node.js</span>
            </div>
            <div>
              <span>AWS</span>
              <span>TypeScript</span>
              <span>Node.js</span>
            </div>
          </div>
        </a>
        <a href="/job-offer/antal-sp-z-o-o--qa-automation-engineer-wroclaw-testing">
          <div>
            <div><h3>QA Automation Engineer</h3></div>
            <div><span>23 500 - 26 800 PLN/month</span></div>
            <div><span>23 500 - 26 800 PLN/month</span></div>
            <div><span>Antal Sp. z o.o.</span></div>
            <div><span>Wrocław</span></div>
            <div><span>Remote</span></div>
            <div><span>2d left</span></div>
            <div>
              <span>Redis</span>
              <span>PostgreSQL</span>
              <span>TypeScript</span>
            </div>
          </div>
        </a>
      </main>
    `;

    const adapter = new JustJoinItAdapter();

    const offers = adapter.parseListings(html);

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      title: "Node.js Developer",
      company: "Accenture",
      salaryText: undefined,
      location: "Warszawa, +3Locations"
    });
    expect(offers[1]).toMatchObject({
      title: "QA Automation Engineer",
      company: "Antal Sp. z o.o.",
      salaryText: "23 500 - 26 800 PLN/month",
      location: "Wrocław"
    });
  });
});
