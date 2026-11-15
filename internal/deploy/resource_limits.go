package deploy

import (
	"fmt"
	"shipyard/internal/model"
	"strconv"
)

func ApplyResourceLimits(cfg map[string]any, limits map[string]model.ServiceLimits) error {
	if err := model.ValidateResourceLimits(limits); err != nil {
		return err
	}
	services, _ := cfg["services"].(map[string]any)
	for name, limit := range limits {
		service, ok := services[name].(map[string]any)
		if !ok {
			continue
		}
		deploy, _ := service["deploy"].(map[string]any)
		if deploy == nil {
			deploy = map[string]any{}
		}
		resources, _ := deploy["resources"].(map[string]any)
		if resources == nil {
			resources = map[string]any{}
		}
		caps, _ := resources["limits"].(map[string]any)
		if caps == nil {
			caps = map[string]any{}
		}
		if limit.CPUs != nil {
			service["cpus"] = *limit.CPUs
			caps["cpus"] = strconv.FormatFloat(*limit.CPUs, 'f', -1, 64)
			delete(service, "cpu_quota")
			delete(service, "cpu_period")
		}
		if limit.MemoryBytes != nil {
			service["mem_limit"] = *limit.MemoryBytes
			caps["memory"] = strconv.FormatInt(*limit.MemoryBytes, 10)
		}
		if len(caps) > 0 {
			resources["limits"] = caps
			deploy["resources"] = resources
			service["deploy"] = deploy
		}
		reservations, _ := resources["reservations"].(map[string]any)
		if limit.CPUs != nil && reservations["cpus"] != nil {
			value, err := strconv.ParseFloat(fmt.Sprint(reservations["cpus"]), 64)
			if err == nil && value > *limit.CPUs {
				return fmt.Errorf("%s: CPU reservation exceeds the configured limit", name)
			}
		}
		if limit.MemoryBytes != nil {
			// docker compose config normalizes memory quantities to bytes.
			for _, v := range []any{service["mem_reservation"], reservations["memory"]} {
				if v == nil {
					continue
				}
				n, err := strconv.ParseFloat(fmt.Sprint(v), 64)
				if err == nil && n > float64(*limit.MemoryBytes) {
					return fmt.Errorf("%s: RAM reservation exceeds the configured limit", name)
				}
			}
		}
	}
	return nil
}
