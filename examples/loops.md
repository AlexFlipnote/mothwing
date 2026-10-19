# Loops
```html
<ul>
  <x-each items="projects" as="project">
    <li>
      <x-if value="project.url"><a href="{{ project.url }}">{{ project.name }}</a></x-if>
      <x-if not="project.url">{{ project.name }}</x-if>
    </li>
  </x-each>
</ul>
```

`<x-each>` repeats its content per item, `index="i"` names the item's position. `<x-if value="...">` shows its content when the value is there and not empty, `not="..."` when it isn't. On lines of their own, they leave no empty lines behind and their content keeps the indent it would have by hand.

`items`, `value` and `not` take a name as it is, `items="projects"`, not a placeholder. The rest of the tags' attributes can have placeholders, `<x-seo title="{{ page.name }}"/>`.

Every tag is ordinary HTML to an editor or formatter. Templates formatted by Prettier build to the same pages.
