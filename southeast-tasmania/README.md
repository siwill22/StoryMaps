# Southeast Tasmania geology story map

A scroll-driven story map in the same visual style as the southern-ocean-gateways prototype, adapted to the geology of southeast Tasmania around Port Arthur and Eaglehawk Neck.

## Running it

Because the page uses ES modules and local fetch patterns, serve it through a local web server rather than opening the HTML file directly:

```bash
cd /Users/simon/GIT/StoryMaps
python3 -m http.server 8778
```

Then open:

```text
http://localhost:8778/southeast-tasmania/
```

## Content themes

- Tasmania's position in southern Gondwana and its high-latitude setting in the Permian
- Permian–Triassic sedimentary records and fossil assemblages
- Mesozoic dolerite and volcanic plumbing in southeast Tasmania
- Dyke and sill formation as fractures, transgressive flow, and bedding-plane propagation
- Regional comparisons with the Mount Wellington / Kunanayi dolerite provinces
- Port Arthur and Eaglehawk Neck as a modern field area for interpreting the ancient geology

## Notes

This prototype is intentionally lightweight: it mirrors the scroll-based storytelling pattern from the existing gateway map, but uses locally styled reconstruction panels and remote geology photography to make the content readable without storing a large asset set.
