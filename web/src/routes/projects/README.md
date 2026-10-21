# Projects

URLs: `/projects`, `/projects/:id`.
List/detail leaf folders contain route entries only; shared feature modules and this README live here.
`ProjectsMainView` renders `useProjectsPage` state through project/environment/application components.
Shared resource hooks validate `/resources` queries/writes using `lib/schemas`; creation waits for server IDs.
Project selection/editor transitions use the tested reducer in `generics`.
Dropdown actions use data attributes and preserve React portal event bubbling.
Variables and access open the shared full-page configuration surface.
