package db

import "errors"

var ErrDeleting = errors.New("Resource deletion is in progress; configuration changes are disabled")

var ErrConflict = errors.New("resource configuration conflicts with an existing resource")
