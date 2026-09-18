/*
 * Loads the page from view.json via deep-time-map's shared Explorer host --
 * see ../../shared/vendor/deep-time-map/js/explorer.js. What used to be 583
 * lines of hand-written wiring (story.js, see git history) is now a recipe.
 *
 * The one thing the recipe format cannot carry is a hyperlink -- caption text
 * is escaped, deliberately, so a recipe can't smuggle in markup. This page's
 * cross-link to its companion page is real navigation, not decoration, so it
 * is appended here rather than dropped.
 */
import { mountExplorer } from '../../shared/vendor/deep-time-map/js/explorer.js';

const app = document.getElementById('app');
try {
  const recipe = await (await fetch('view.json')).json();
  await mountExplorer(recipe, app);

  const body = app.querySelector('.dtm-legend .dtm-panel-body');
  const p = document.createElement('p');
  p.className = 'dtm-credit';
  p.innerHTML = 'The lag-time provenance method used on the companion '
    + '<a href="../detrital-zircons/">detrital zircon page</a> follows Jian et al. '
    + '(2022), <em>Journal of Geophysical Research</em> — with thanks to Dongchuan Jian.';
  body.append(p);
} catch (err) {
  console.error(err);
  app.textContent = 'Could not load: ' + err.message;
}
