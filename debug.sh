#!/bin/bash

# Define an array of file paths
FILES=(


'apps/landing/app/page.tsx'
'apps/dapp/app/layout.tsx'
'apps/dapp/app/deposit/page.tsx'
'apps/dapp/app/user/page.tsx'
'apps/dapp/app/leaderboard/page.tsx'
'apps/dapp/app/page.tsx'
'apps/dapp/app/components/Navigation.tsx'
'apps/dapp/app/components/BorrowSlider.tsx'
'apps/dapp/app/components/RepaySlider.tsx'


)

remove_comments="${1:-true}"  # Default to true if no parameter is provided

# Directory where logs are stored
log_dir="logs"
error_section_included=false

# Check if log directory exists before trying to access it
if [ -d "$log_dir" ]; then
  # Find the most recent log file
  log_file=$(ls -t "$log_dir"/*.txt 2>/dev/null | head -n 1)

  # Check if a log file was found
  if [ -n "$log_file" ]; then
    # Extract the first error log and everything that follows from the most recent log file
    context=$(awk '/\[ERROR\]/ {flag=1} flag' "$log_file")
    pre_error_context=$(awk '/\[ERROR\]/ {for (i=NR-5; i<NR; i++) print lines[i%4]; flag=1} {lines[NR%4]=$0} flag' "$log_file")

    # Check if any errors were found
    if [ -n "$context" ]; then
      error_section_included=true
    fi
  fi
fi

# Specify the directory path of interest for the tree command
tree_dir="apps/dapp/app"  # Update this to your path of interest

# Function to determine OS and copy to clipboard
copy_to_clipboard() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS uses pbcopy
    pbcopy
    echo "Logs and script content have been copied to clipboard using pbcopy (macOS)."
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Check if xclip is available
    if command -v xclip > /dev/null; then
      xclip -selection clipboard
      echo "Logs and script content have been copied to clipboard using xclip (Linux)."
    else
      # Try with xsel as a fallback
      if command -v xsel > /dev/null; then
        xsel --clipboard --input
        echo "Logs and script content have been copied to clipboard using xsel (Linux)."
      else
        echo "Neither xclip nor xsel is installed. Please install one of them or copy manually."
        cat # Output to terminal instead
      fi
    fi
  else
    echo "Unsupported OS for clipboard operations. Printing to terminal instead."
    cat # Output to terminal instead
  fi
}

{
echo "\`\`\`"  # Start triple backticks
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then  # Check if file exists before trying to cat it
        echo "File: $file"
        echo "---------------------------------"
        if [ "$remove_comments" = true ]; then
            # Remove comments in /* */ format and print
            sed '/\/\*/,/\*\//d' "$file"
        else
            # Print the file as is
            cat "$file"
        fi
        echo ""
        echo "================================="
        echo ""
    else
        echo "File: $file (not found)"
        echo "---------------------------------"
        echo "File does not exist."
        echo ""
        echo "================================="
        echo ""
    fi
done

# Check if the tree directory exists
if [ -d "$tree_dir" ]; then
    # Print directory structure of the specified path excluding certain paths
    tree "$tree_dir" -I "node_modules" -L 4
else
    echo "Directory $tree_dir does not exist or cannot be accessed."
fi

# Conditionally add the pre-error context and error section
if [ "$error_section_included" = true ]; then
    echo ""
    echo "Pre-Error Context (5 lines before the first error) and First Error Context from $log_file:"
    echo "---------------------------------"
    echo "$pre_error_context"
    echo "$context"
    echo "================================="
fi

echo "\`\`\`"  # End triple backticks
if [ "$error_section_included" = true ]; then
    echo "Please fix"
else
    echo "Given the above:"
fi
} | copy_to_clipboard