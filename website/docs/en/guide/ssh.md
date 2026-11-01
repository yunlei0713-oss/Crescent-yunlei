# SSH connections

Crescent can read `~/.ssh/config`. It also supports custom SSH connections, login actions, SSH options, and password environment variables.

Switch among these in one workbench:

- Local terminal
- Test environments
- Production hosts
- Other remote machines

Users open iTerm from a connection card and operate it manually. After switching hosts, the Agent can only use evidence authorized on the new identity, never old-session evidence. Users explicitly open other targets; no Agent subterminal tool connects for them.

## Flow {#flow}

<ArchitectureDiagram name="ssh-en" />

After explicit selection and confirmation, Main creates shared PTY/iTerm and connects with current saved settings. User-configured login actions are typed line by line by the manual connection workflow, not as an Agent capability. Observation defaults off and needs native confirmation. The standalone external-terminal entry does not implicitly connect a cluster.

## Login actions

A custom connection can include login actions. After SSH starts, Crescent types those lines into the terminal, one line at a time, in the order you wrote. Use this for `sudo -i`, a directory change, or a second hop inside a bastion. Keep passwords in environment variables, not in the action text.

## Cluster host match

An optional cluster host pattern says whether the terminal’s hostname is already inside the target environment. Use a glob such as `*.gd17.*`, or a regular expression such as `^node-\d+$`. A pattern that is too long or too complex is rejected when you save.

## Organizing the list

You can favorite a connection, copy it as JSON and import it, and reorder entries. Main protects passwords and other secrets; still inspect exported settings before sharing. The Agent analyzes only evidence authorized for the current target. See [observation](/en/guide/terminal).
