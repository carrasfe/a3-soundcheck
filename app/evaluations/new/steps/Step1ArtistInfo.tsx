"use client";

import { Input, Select } from "../ui";
import type { EvalFormData, StepProps } from "../types";

const GENRES = [
  "Rock / Alt / Indie", "Country / Americana", "Metal / Hard Rock", "Pop",
  "Punk / Hardcore / Pop-Punk / Emo", "Southern Rock / Blues Rock",
  "Progressive Rock / Prog Metal", "EDM / Dance / Electronic", "Hip-Hop / Rap",
  "R&B / Soul", "Latin / Regional Mexican", "Christian / Gospel / Worship",
  "Folk / Singer-Songwriter", "Bluegrass / Roots", "Jam Band / Jam Rock",
  "K-Pop / J-Pop / J-Rock", "Reggae / Ska", "Jazz / Blues (Traditional)",
  "Broadway / Theater",
];

const VIP_OPTIONS = [
  { value: "none",          label: "No VIP — never offered" },
  { value: "offered_before",label: "Has offered VIP in the past" },
  { value: "basic",         label: "Currently runs basic VIP" },
  { value: "premium_mg",   label: "Runs premium VIP (M&G / soundcheck)" },
  { value: "tiered_high",  label: "Runs tiered VIP with high-price options" },
];

export default function Step1ArtistInfo({ data, onChange, errors }: StepProps) {
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value });

  return (
    <div className="space-y-8">
      {/* Core identity */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Artist Identity
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Artist Name"
            required
            value={data.artist_name}
            onChange={set("artist_name")}
            placeholder="e.g. The Marias"
            error={errors.artist_name}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Genre<span className="ml-0.5 text-[#C0392B]">*</span>
            </label>
            <select
              value={data.genre}
              onChange={set("genre")}
              className={`rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B] ${
                errors.genre ? "border-red-400" : "border-gray-300"
              }`}
            >
              <option value="">Select genre…</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            {errors.genre && <p className="text-xs text-[#C0392B]">{errors.genre}</p>}
          </div>
        </div>
      </section>

      {/* Management */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Management
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Management Company"
            value={data.management_company}
            onChange={set("management_company")}
            placeholder="e.g. Vector Management"
          />
          <Input
            label="Manager Name(s)"
            value={data.manager_names}
            onChange={set("manager_names")}
            placeholder="e.g. John Smith, Jane Doe"
          />
          <div className="sm:col-span-2">
            <Input
              label="Other Artists on Roster"
              value={data.other_mgmt_artists}
              onChange={set("other_mgmt_artists")}
              placeholder="e.g. Kings of Leon, Cage the Elephant"
            />
          </div>
        </div>
      </section>

      {/* Booking */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Booking
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Booking Agent"
            value={data.booking_agent}
            onChange={set("booking_agent")}
            placeholder="e.g. WME — Sarah Johnson"
          />
          <Input
            label="Other Booked Artists"
            value={data.other_agent_artists}
            onChange={set("other_agent_artists")}
            placeholder="e.g. Paramore, 21 Pilots"
          />
        </div>
      </section>

      {/* Merch & VIP */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Merch & VIP
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Current Merch Provider"
            value={data.merch_provider}
            onChange={set("merch_provider")}
            placeholder="e.g. Bravado, Live Nation Merchandise"
          />
          <Select
            label="VIP / M&G Program"
            value={data.vip_level}
            onChange={set("vip_level")}
          >
            {VIP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
      </section>
    </div>
  );
}
