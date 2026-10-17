package buildinfo

import "runtime"

var Version = "dev"
var Commit = "unknown"
var BuiltAt = "unknown"

const UpdaterProtocol = 1

type Info struct {
	Version         string `json:"version"`
	Commit          string `json:"commit"`
	BuiltAt         string `json:"builtAt"`
	Architecture    string `json:"architecture"`
	UpdaterProtocol int    `json:"updaterProtocol"`
}

func Current() Info { return Info{Version, Commit, BuiltAt, runtime.GOARCH, UpdaterProtocol} }
