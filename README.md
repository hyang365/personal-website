# Hunter Yang · Personal Archive

A desktop-first personal site set in a low-poly study. Visitors start seated at a desk and can open three folders, a swimming trophy, a globe, and a book. The study door leads to an indoor basketball court with two playable balls and a door back to the study.

## Edit the portfolio

Open `content.js` to change each item’s title, body, and links. Use paragraph breaks in the body and add links in the format shown in the file. The labels and reading cards update from this file. To change the site name, edit the title and heading in `index.html`.

## Publish on GitHub Pages

1. Unzip this archive and put its contents at the root of your GitHub repository. The repository’s root should contain `index.html`, `content.js`, the other source files, and the `vendor` folder.
2. Commit the files to `main`. In the repository’s **Settings → Pages**, under **Build and deployment**, choose **Deploy from a branch**.
3. Select **main** and **/(root)**, then save. When Pages finishes deploying, open the URL shown in the Pages settings.

[GitHub Pages publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

The site uses relative paths, so it also works in a project repository hosted at a URL such as `https://username.github.io/repository/`. All fonts, textures, and scripts are served with the site. There is no build command, server, or API key.

## Run locally

From this folder, run `python3 -m http.server 8000` and open `http://localhost:8000`. Serving over HTTP allows the browser to load the JavaScript modules.

## Play

- At the desk, point at an item to highlight it and click to pick it up. Press **Esc** or choose **Put back** to close its entry.
- Press **Space** to stand. Walk around either side of the desk with **WASD** or the **arrow keys**. Drag to look, or choose **Capture mouse** for first-person mouse look. **Esc** releases the mouse.
- Approach the gymnasium door, then click the knob or press **E** nearby. Use the study door in the gym to return.
- Click a nearby ball or press **E** to pick it up. Aim at a hoop and click for a quick shot, or hold and release **click** or **F** to control power. **E** puts the ball down. **R** resets both balls and the score.
- In the study, **Space** near the chair sits down again. **R** returns directly to the desk. The six visible labels can also be opened by keyboard with **Tab** and **Enter**.

The game uses WebGL when available and a lower-resolution Canvas renderer on other browsers. With both renderers unavailable, the six archive entries are available as buttons.
