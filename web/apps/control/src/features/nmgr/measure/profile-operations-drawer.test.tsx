/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { seed } from "../model";
import { MeasureProfileOperations } from "./profile-operations-drawer";
afterEach(cleanup);
it("finds and selects a Profile among twelve linked Profiles, retaining selection on live updates",()=>{
  const state=seed(), template=state.entities.find(item=>item.kind==="Profile"&&item.deployed!==null)!;
  const profiles=Array.from({length:12},(_,index)=>({...template,id:`profile-${index}`,name:`Profile ${index+1}`}));
  state.entities.push(...profiles);
  const props={profiles,state,now:Date.now(),renderOperations:(profile:typeof template)=><button>Edit {profile.name}</button>};
  const ui=render(<MeasureProfileOperations {...props}/>);
  expect(screen.getAllByRole("button",{name:/^Open operations for/})).toHaveLength(12);
  fireEvent.change(screen.getByRole("textbox",{name:"Search linked Profiles"}),{target:{value:"Profile 12"}});
  expect(screen.getAllByRole("button",{name:/^Open operations for/})).toHaveLength(1);
  fireEvent.click(screen.getByRole("button",{name:"Open operations for Profile 12"}));
  ui.rerender(<MeasureProfileOperations {...props} profiles={profiles.map(profile=>({...profile}))} now={props.now+5000}/>);
  expect(screen.getByRole("region",{name:"Profile operations: Profile 12"})).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox",{name:"Search linked Profiles"}),{target:{value:"not found"}});
  expect(screen.getByText("No matching Profiles.")).toBeTruthy();
  expect(screen.getByRole("region",{name:"Profile operations: Profile 12"})).toBeTruthy();
});
