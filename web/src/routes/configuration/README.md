# Configuration

URLs: /configure/:kind/:id.

Edits a resource, including the network form used for network configuration.

Endpoints: `/git/*`, `/servers/:id/haproxy`, and resource writes through the shared configuration surface.
Key modules: `ConfigurationMainView`, `ConfigurationBody`, `NetworkForm`, `GitConnection`, `HAProxySettings`, route hooks/services.
