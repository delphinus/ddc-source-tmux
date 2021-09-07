# ddc-tmux

Around completion for ddc.vim

This source collects candidates from all panes of [tmux](https://github.com/tmux/tmux).

## Required

### denops.vim

https://github.com/vim-denops/denops.vim

### ddc.vim

https://github.com/Shougo/ddc.vim

### tmux

https://github.com/tmux/tmux

## Configuration

```vim
" Use around source.
call ddc#custom#patch_global('sources', ['tmux'])

" Change source options
call ddc#custom#patch_global('sourceOptions', {
      \ 'tmux': {'mark': 'T'},
      \ })
```
