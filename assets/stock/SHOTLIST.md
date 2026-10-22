# Stock photos still needed (example events)

Real Ring Playground frames already cover the parcel, car and bird-feeder scenes. The empty porch (day and night) uses a CC BY-SA photo from Wikimedia Commons. The scenes below still use illustrations until a photo is added.

**How to add one:** save the photo as `assets/stock/<scene>.jpg`, add an entry to `assets/stock/credits.json` (copy an existing one), then run `npm run stock`, then `npm run warm:captions -- --refresh && npm run export:captions` so the cached captions describe the new photo. Restart the scenario (or **Reset for recording**) to see it.

Pick **landscape** photos with the door or porch in view, people seen from behind or side-on, and **no clearly identifiable faces**. Unsplash and Pexels licences allow this use. Credit them anyway.

| Scene file | What the photo should show | Search on Unsplash / Pexels |
|---|---|---|
| `aide_arrives.jpg` | Someone with a bag standing at a front door, from behind | "person at front door", "visitor at door" |
| `door_answered.jpg` | Front door open, two people at the threshold | "opening front door", "greeting at door" |
| `aide_leaves.jpg` | Someone with a bag walking away from a house | "walking away from house" |
| `meal_delivery.jpg` | Delivery person handing over a food bag at a door | "food delivery door", "delivery handover" |
| `resident_steps_out.jpg` | Older person stepping out of a front door (back or side view) | "elderly woman front door", "senior leaving house" |
| `package_brought_in.jpg` | Hands picking a parcel up from a doorstep | "picking up package doorstep" |
| `visitor_ding_night.jpg` | Person at a front door at night, porch light on | "front door night", "person porch night" |
| `person_night.jpg` | Figure near a porch at night | "porch at night silhouette" |

Set `"night": true` for the two night scenes; the script darkens them and adds grain.
